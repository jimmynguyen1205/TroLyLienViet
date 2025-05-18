import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { auth } from './middleware/auth.js';
import supabase from './supabase.js';
import authRouter from './routes/auth.js';
import agentRouter from './agents/router/agentRouter.js';

// Load environment variables
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

let openai = null;
function getOpenAI() {
  if (!openai) {
    const { OpenAI } = require('@langchain/openai');
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

// Routes
app.use('/auth', authRouter);
app.use('/agents', agentRouter);

// Login endpoint
app.post('/login', [
  body('email').isEmail().withMessage('Email không hợp lệ'),
  body('password').notEmpty().withMessage('Mật khẩu không được để trống')
], async (req, res) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password } = req.body;

    // Get user from Supabase with role info
    const { data: user, error: userError } = await supabase
      .from('users')
      .select(`
        id,
        full_name,
        email,
        role_id,
        roles (
          name,
          description
        )
      `)
      .eq('email', email)
      .single();

    if (userError || !user) {
      return res.status(401).json({ error: 'Không tìm thấy người dùng' });
    }

    // Check if user is active
    if (!user.is_active) {
      return res.status(401).json({ error: 'Tài khoản đã bị khóa' });
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id,
        email: user.email,
        role: user.roles.name
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '1h' }
    );

    // Create session
    const { error: sessionError } = await supabase
      .from('user_sessions')
      .insert([{
        user_id: user.id,
        token: token,
        expires_at: new Date(Date.now() + (process.env.JWT_EXPIRES_IN || 3600) * 1000)
      }]);

    if (sessionError) {
      console.error('Error creating session:', sessionError);
    }

    // Update last login
    await supabase
      .from('users')
      .update({ last_login: new Date() })
      .eq('id', user.id);

    // Log login action
    await supabase
      .from('logs')
      .insert([{
        user_id: user.id,
        action: 'login',
        ip_address: req.ip
      }]);

    // Return user info
    res.json({
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        role: user.roles.name,
        roleDescription: user.roles.description
      }
    });

    localStorage.setItem('token', token);

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Register endpoint
app.post('/register', [
  body('email').isEmail().withMessage('Email không hợp lệ'),
  body('password').isLength({ min: 6 }).withMessage('Mật khẩu phải có ít nhất 6 ký tự'),
  body('fullName').notEmpty().withMessage('Họ tên không được để trống'),
  body('roleId').isInt().withMessage('Vai trò không hợp lệ')
], async (req, res) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email, password, fullName, roleId } = req.body;

    // Check if email already exists
    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .single();

    if (existingUser) {
      return res.status(400).json({ error: 'Email đã tồn tại' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // Create user
    const { data: user, error: userError } = await supabase
      .from('users')
      .insert([{
        email,
        password_hash: passwordHash,
        full_name: fullName,
        role_id: roleId
      }])
      .select()
      .single();

    if (userError) {
      return res.status(500).json({ error: 'Lỗi khi tạo người dùng' });
    }

    // Log registration
    await supabase
      .from('logs')
      .insert([{
        user_id: user.id,
        action: 'register',
        ip_address: req.ip
      }]);

    res.status(201).json({
      message: 'Đăng ký thành công',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        roleId: user.role_id
      }
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Chat endpoint
app.post('/chat', auth, async (req, res) => {
  try {
    const { message } = req.body;
    const userId = req.user.id;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Log chat action
    await supabase
      .from('logs')
      .insert([{
        user_id: userId,
        action: 'chat',
        details: { message }
      }]);

    // Get chat history
    const { data: history } = await supabase
      .from('chat_history')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(10);

    // Generate response
    const openai = getOpenAI();
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant."
        },
        ...history.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        {
          role: "user",
          content: message
        }
      ]
    });

    const aiResponse = response.choices[0].message.content;

    // Save to chat history
    await supabase
      .from('chat_history')
      .insert([
        {
          user_id: userId,
          role: 'user',
          content: message
        },
        {
          user_id: userId,
          role: 'assistant',
          content: aiResponse
        }
      ]);

    res.json({ response: aiResponse });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Start server
app.listen(port, () => {
  console.log(`TROLYLIENVIET Server is running on port ${port}`);
});

// Gọi API gia hạn token mỗi 7 ngày
setInterval(async () => {
  const token = localStorage.getItem('token');
  if (token) {
    try {
      const response = await fetch('/auth/refresh-token', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      if (data.token) {
        localStorage.setItem('token', data.token);
      }
    } catch (error) {
      console.error('Error refreshing token:', error);
    }
  }
}, 7 * 24 * 60 * 60 * 1000); // 7 ngày

// Kiểm tra token khi load trang
const token = localStorage.getItem('token');
if (!token) {
  window.location.href = '/login';
}

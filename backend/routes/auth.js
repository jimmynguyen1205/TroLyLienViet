import express from 'express';
import supabase from '../supabase.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import cors from 'cors';
import { auth } from '../middleware/auth.js';

const router = express.Router();

// JWT secret key - should be in .env file
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Middleware to verify JWT token
const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

// Login route
router.post('/login', [
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

    // Generate JWT token with longer expiration (30 days)
    const token = jwt.sign(
      { 
        userId: user.id,
        email: user.email,
        role: user.roles.name
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Create session with longer expiration
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30); // 30 days from now

    const { error: sessionError } = await supabase
      .from('user_sessions')
      .insert([{
        user_id: user.id,
        token: token,
        expires_at: expiresAt,
        device_info: req.headers['user-agent'],
        ip_address: req.ip
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
        ip_address: req.ip,
        device_info: req.headers['user-agent']
      }]);

    // Return user info with token
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

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Refresh token route
router.post('/refresh-token', auth, async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    // Get current session
    const { data: session, error: sessionError } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('token', token)
      .single();

    if (sessionError || !session) {
      return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ' });
    }

    // Generate new token
    const newToken = jwt.sign(
      { 
        userId: req.user.id,
        email: req.user.email,
        role: req.user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    // Update session with new token
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const { error: updateError } = await supabase
      .from('user_sessions')
      .update({
        token: newToken,
        expires_at: expiresAt,
        last_activity: new Date()
      })
      .eq('token', token);

    if (updateError) {
      console.error('Error updating session:', updateError);
      return res.status(500).json({ error: 'Lỗi khi gia hạn phiên đăng nhập' });
    }

    res.json({
      token: newToken,
      user: req.user
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Register route
router.post('/register', [
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

// Verify token and return user info
router.get('/verify', async (req, res) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Không tìm thấy token' });
    }

    const token = authHeader.split(' ')[1];

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user info from Supabase
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
      .eq('id', decoded.userId)
      .single();

    if (userError || !user) {
      return res.status(401).json({ error: 'Không tìm thấy người dùng' });
    }

    // Check if user is active
    if (!user.is_active) {
      return res.status(401).json({ error: 'Tài khoản đã bị khóa' });
    }

    // Check if session is valid
    const { data: session, error: sessionError } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('token', token)
      .eq('is_active', true)
      .single();

    if (sessionError || !session) {
      return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ' });
    }

    // Return user info
    res.json({
      id: user.id,
      fullName: user.full_name,
      email: user.email,
      role: user.roles.name,
      roleDescription: user.roles.description
    });

  } catch (error) {
    console.error('Error verifying token:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token không hợp lệ' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token đã hết hạn' });
    }
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Logout route
router.post('/logout', auth, async (req, res) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    // Delete session
    const { error: sessionError } = await supabase
      .from('user_sessions')
      .delete()
      .eq('token', token);

    if (sessionError) {
      console.error('Error deleting session:', sessionError);
    }

    // Log logout action
    await supabase
      .from('logs')
      .insert([{
        user_id: req.user.id,
        action: 'logout',
        ip_address: req.ip
      }]);

    res.json({ message: 'Đăng xuất thành công' });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router; 
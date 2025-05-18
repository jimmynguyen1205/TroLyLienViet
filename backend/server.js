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
import { PromptTemplate } from '@langchain/core/prompts';

// Load environment variables
dotenv.config();

console.log('Starting server...');
console.log('Environment variables loaded:', {
  PORT: process.env.PORT,
  NODE_ENV: process.env.NODE_ENV
});

const app = express();
const port = process.env.PORT || 3005;

// Middleware
app.use(cors());
app.use(express.json());

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

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
    const userName = req.user.fullName;
    const userRole = req.user.role;

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
    const openai = await import('@langchain/openai');
    const response = await openai.default.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: `Bạn là AI Tổng của công ty bảo hiểm. Bạn sẽ trả lời với tên và vai trò của người dùng.

Hướng dẫn trả lời:
1. Luôn bắt đầu bằng lời chào thân thiện với tên và vai trò của người dùng
2. Sử dụng ngôn ngữ trang trọng, lịch sự
3. Thêm emoji phù hợp để tạo cảm giác thân thiện
4. Kết thúc bằng lời đề nghị hỗ trợ thêm
5. Phân tích intent của câu hỏi và thêm nhãn intent vào cuối câu trả lời

Các intent có thể có:
- hỏi_hợp_đồng: Câu hỏi về hợp đồng bảo hiểm
- tra_cứu_claim: Câu hỏi về bồi thường, khiếu nại
- hỏi_đào_tạo: Câu hỏi về đào tạo, nghiệp vụ
- hỏi_tuyển_dụng: Câu hỏi về tuyển dụng, nhân sự
- hỏi_chung: Câu hỏi chung, không thuộc các nhóm trên

Ví dụ:
"Xin chào anh/chị [Tên], [Vai trò]! 👋

[Tên] thân mến, em rất vui được hỗ trợ anh/chị. [Nội dung trả lời]

Em có thể giúp gì thêm cho anh/chị không ạ? 😊

[intent: hỏi_hợp_đồng]"`
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

    let aiResponse = response.choices[0].message.content;

    // Thêm tên và role vào câu trả lời nếu chưa có
    if (!aiResponse.includes(userName) || !aiResponse.includes(userRole)) {
      aiResponse = `Xin chào anh/chị ${userName}, ${userRole}! 👋\n\n${userName} thân mến, em rất vui được hỗ trợ anh/chị.\n\n${aiResponse}\n\nEm có thể giúp gì thêm cho anh/chị không ạ? 😊`;
    }

    // Trích xuất intent từ câu trả lời
    const intentMatch = aiResponse.match(/\[intent: (.*?)\]/);
    const intent = intentMatch ? intentMatch[1] : 'hỏi_chung';

    // Save to chat history
    await supabase
      .from('chat_history')
      .insert([
        {
          user_id: userId,
          role: 'user',
          content: message,
          intent: intent
        },
        {
          user_id: userId,
          role: 'assistant',
          content: aiResponse,
          intent: intent
        }
      ]);

    res.json({ 
      response: aiResponse,
      intent: intent
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Agents list endpoint
app.get('/agents/list', auth, async (req, res) => {
  try {
    const agents = [
      {
        id: 'ai-hop-dong',
        name: 'AI Hợp đồng',
        description: 'Xử lý các vấn đề về hợp đồng bảo hiểm, điều khoản, quyền lợi, nghĩa vụ, gia hạn, hủy hợp đồng.',
        icon: '📄'
      },
      {
        id: 'ai-dao-tao',
        name: 'AI Đào tạo',
        description: 'Hướng dẫn và đào tạo nghiệp vụ, quy trình làm việc, kỹ năng bán hàng, chăm sóc khách hàng.',
        icon: '🎓'
      },
      {
        id: 'ai-claim',
        name: 'AI Claim',
        description: 'Xử lý bồi thường, khiếu nại, hướng dẫn thủ tục, giải quyết tranh chấp.',
        icon: '💰'
      },
      {
        id: 'ai-tuyen-dung',
        name: 'AI Tuyển dụng',
        description: 'Thông tin về tuyển dụng, phát triển nhân sự, chính sách nhân sự, đào tạo nội bộ.',
        icon: '👥'
      }
    ];

    // Log action
    await supabase
      .from('logs')
      .insert([{
        user_id: req.user.id,
        action: 'get_agents_list',
        details: { agents_count: agents.length }
      }]);

    res.json({
      success: true,
      data: agents
    });

  } catch (error) {
    console.error('Error getting agents list:', error);
    res.status(500).json({ 
      success: false,
      error: 'Internal server error' 
    });
  }
});

// Chat with specific agent endpoint
app.post('/agents/chat', auth, async (req, res) => {
  try {
    const { message, agent_name } = req.body;
    const userId = req.user.id;
    const userName = req.user.fullName;
    const userRole = req.user.role;

    if (!message || !agent_name) {
      return res.status(400).json({ error: 'Message and agent_name are required' });
    }

    // Log chat action
    await supabase
      .from('logs')
      .insert([{
        user_id: userId,
        action: 'agent_chat',
        details: { message, agent_name }
      }]);

    // Nếu là agent general, xử lý bằng generalAgent
    if (agent_name === 'general') {
      const generalAgent = await import('./agents/service/generalAgent.js');
      const response = await generalAgent.default.handleQuestion(message, userId, userName, userRole);
      return res.json(response);
    }

    // Nếu không phải agent general, xử lý bình thường
    const agentResponse = await handleAgentChat(message, agent_name, userId, userName, userRole);
    res.json(agentResponse);

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Helper function to handle agent chat
async function handleAgentChat(message, agent_name, userId, userName, userRole) {
  // Get chat history for this agent
  const { data: history } = await supabase
    .from('chat_history')
    .select('*')
    .eq('user_id', userId)
    .eq('agent_name', agent_name)
    .order('created_at', { ascending: false })
    .limit(10);

  // Get agent info
  const agents = {
    'ai-hop-dong': {
      name: 'AI Hợp đồng',
      description: 'Xử lý các vấn đề về hợp đồng bảo hiểm, điều khoản, quyền lợi, nghĩa vụ, gia hạn, hủy hợp đồng.',
      icon: '📄',
      systemPrompt: `Bạn là AI Hợp đồng của công ty bảo hiểm. Bạn sẽ trả lời các câu hỏi về hợp đồng bảo hiểm.

Hướng dẫn trả lời:
1. Luôn bắt đầu bằng lời chào thân thiện với tên và vai trò của người dùng
2. Sử dụng ngôn ngữ trang trọng, lịch sự
3. Thêm emoji phù hợp để tạo cảm giác thân thiện
4. Kết thúc bằng lời đề nghị hỗ trợ thêm
5. Phân tích intent của câu hỏi và thêm nhãn intent vào cuối câu trả lời

Các intent có thể có:
- hỏi_điều_khoản: Câu hỏi về điều khoản hợp đồng
- hỏi_quyền_lợi: Câu hỏi về quyền lợi bảo hiểm
- hỏi_gia_hạn: Câu hỏi về gia hạn hợp đồng
- hỏi_hủy: Câu hỏi về hủy hợp đồng
- hỏi_chung: Câu hỏi chung về hợp đồng`,
      scopePrompt: `Bạn là AI Hợp đồng của công ty bảo hiểm. Nhiệm vụ của bạn là phân tích xem câu hỏi có thuộc phạm vi xử lý của bạn không.

Phạm vi xử lý của bạn:
- Hợp đồng bảo hiểm
- Điều khoản hợp đồng
- Quyền lợi bảo hiểm
- Nghĩa vụ bảo hiểm
- Gia hạn hợp đồng
- Hủy hợp đồng

Câu hỏi của người dùng: {question}

Hãy phân tích và trả về JSON với format:
{
  "is_in_scope": true/false,
  "reason": "lý do tại sao thuộc/không thuộc phạm vi"
}

Chỉ trả về JSON, không thêm text khác.`
    },
    'ai-dao-tao': {
      name: 'AI Đào tạo',
      description: 'Hướng dẫn và đào tạo nghiệp vụ, quy trình làm việc, kỹ năng bán hàng, chăm sóc khách hàng.',
      icon: '🎓',
      systemPrompt: `Bạn là AI Đào tạo của công ty bảo hiểm. Bạn sẽ trả lời các câu hỏi về đào tạo và nghiệp vụ.

Hướng dẫn trả lời:
1. Luôn bắt đầu bằng lời chào thân thiện với tên và vai trò của người dùng
2. Sử dụng ngôn ngữ trang trọng, lịch sự
3. Thêm emoji phù hợp để tạo cảm giác thân thiện
4. Kết thúc bằng lời đề nghị hỗ trợ thêm
5. Phân tích intent của câu hỏi và thêm nhãn intent vào cuối câu trả lời

Các intent có thể có:
- hỏi_nghiệp_vụ: Câu hỏi về nghiệp vụ bảo hiểm
- hỏi_kỹ_năng: Câu hỏi về kỹ năng bán hàng
- hỏi_quy_trình: Câu hỏi về quy trình làm việc
- hỏi_chăm_sóc: Câu hỏi về chăm sóc khách hàng
- hỏi_chung: Câu hỏi chung về đào tạo`,
      scopePrompt: `Bạn là AI Đào tạo của công ty bảo hiểm. Nhiệm vụ của bạn là phân tích xem câu hỏi có thuộc phạm vi xử lý của bạn không.

Phạm vi xử lý của bạn:
- Đào tạo nghiệp vụ bảo hiểm
- Quy trình làm việc
- Kỹ năng bán hàng
- Chăm sóc khách hàng
- Đào tạo nội bộ

Câu hỏi của người dùng: {question}

Hãy phân tích và trả về JSON với format:
{
  "is_in_scope": true/false,
  "reason": "lý do tại sao thuộc/không thuộc phạm vi"
}

Chỉ trả về JSON, không thêm text khác.`
    },
    'ai-claim': {
      name: 'AI Claim',
      description: 'Xử lý bồi thường, khiếu nại, hướng dẫn thủ tục, giải quyết tranh chấp.',
      icon: '💰',
      systemPrompt: `Bạn là AI Claim của công ty bảo hiểm. Bạn sẽ trả lời các câu hỏi về bồi thường và khiếu nại.

Hướng dẫn trả lời:
1. Luôn bắt đầu bằng lời chào thân thiện với tên và vai trò của người dùng
2. Sử dụng ngôn ngữ trang trọng, lịch sự
3. Thêm emoji phù hợp để tạo cảm giác thân thiện
4. Kết thúc bằng lời đề nghị hỗ trợ thêm
5. Phân tích intent của câu hỏi và thêm nhãn intent vào cuối câu trả lời

Các intent có thể có:
- hỏi_bồi_thường: Câu hỏi về bồi thường
- hỏi_khiếu_nại: Câu hỏi về khiếu nại
- hỏi_thủ_tục: Câu hỏi về thủ tục
- hỏi_tranh_chấp: Câu hỏi về tranh chấp
- hỏi_chung: Câu hỏi chung về claim`,
      scopePrompt: `Bạn là AI Claim của công ty bảo hiểm. Nhiệm vụ của bạn là phân tích xem câu hỏi có thuộc phạm vi xử lý của bạn không.

Phạm vi xử lý của bạn:
- Bồi thường bảo hiểm
- Khiếu nại
- Thủ tục bồi thường
- Giải quyết tranh chấp

Câu hỏi của người dùng: {question}

Hãy phân tích và trả về JSON với format:
{
  "is_in_scope": true/false,
  "reason": "lý do tại sao thuộc/không thuộc phạm vi"
}

Chỉ trả về JSON, không thêm text khác.`
    },
    'ai-tuyen-dung': {
      name: 'AI Tuyển dụng',
      description: 'Thông tin về tuyển dụng, phát triển nhân sự, chính sách nhân sự, đào tạo nội bộ.',
      icon: '👥',
      systemPrompt: `Bạn là AI Tuyển dụng của công ty bảo hiểm. Bạn sẽ trả lời các câu hỏi về tuyển dụng và nhân sự.

Hướng dẫn trả lời:
1. Luôn bắt đầu bằng lời chào thân thiện với tên và vai trò của người dùng
2. Sử dụng ngôn ngữ trang trọng, lịch sự
3. Thêm emoji phù hợp để tạo cảm giác thân thiện
4. Kết thúc bằng lời đề nghị hỗ trợ thêm
5. Phân tích intent của câu hỏi và thêm nhãn intent vào cuối câu trả lời

Các intent có thể có:
- hỏi_tuyển_dụng: Câu hỏi về tuyển dụng
- hỏi_nhân_sự: Câu hỏi về nhân sự
- hỏi_chính_sách: Câu hỏi về chính sách
- hỏi_đào_tạo: Câu hỏi về đào tạo nội bộ
- hỏi_chung: Câu hỏi chung về tuyển dụng`,
      scopePrompt: `Bạn là AI Tuyển dụng của công ty bảo hiểm. Nhiệm vụ của bạn là phân tích xem câu hỏi có thuộc phạm vi xử lý của bạn không.

Phạm vi xử lý của bạn:
- Tuyển dụng nhân sự
- Phát triển nhân sự
- Chính sách nhân sự
- Đào tạo nội bộ

Câu hỏi của người dùng: {question}

Hãy phân tích và trả về JSON với format:
{
  "is_in_scope": true/false,
  "reason": "lý do tại sao thuộc/không thuộc phạm vi"
}

Chỉ trả về JSON, không thêm text khác.`
    }
  };

  const agent = agents[agent_name];
  if (!agent) {
    throw new Error('Invalid agent name');
  }

  try {
    // Khởi tạo OpenAI client
    const { OpenAI } = await import('@langchain/openai');
    const openai = new OpenAI({ 
      apiKey: process.env.OPENAI_API_KEY,
      modelName: 'gpt-3.5-turbo',
      temperature: 0.7
    });

    // Kiểm tra phạm vi câu hỏi
    const scopePrompt = PromptTemplate.fromTemplate(agent.scopePrompt);
    const scopeResponse = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: await scopePrompt.format({ question: message })
        }
      ]
    });

    const scopeAnalysis = JSON.parse(scopeResponse.choices[0].message.content);

    // Nếu câu hỏi không thuộc phạm vi
    if (!scopeAnalysis.is_in_scope) {
      return {
        response: `⚠️ Câu hỏi của bạn không thuộc phạm vi xử lý của bộ phận ${agent.name}. Bạn vui lòng hỏi AI Tổng để được định hướng đúng.`,
        intent: 'hỏi_sai_phạm_vi',
        agent: {
          name: agent.name,
          description: agent.description,
          icon: agent.icon
        }
      };
    }

    // Generate response
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        {
          role: "system",
          content: agent.systemPrompt
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

    let aiResponse = response.choices[0].message.content;

    // Thêm tên và role vào câu trả lời nếu chưa có
    if (!aiResponse.includes(userName) || !aiResponse.includes(userRole)) {
      aiResponse = `Xin chào anh/chị ${userName}, ${userRole}! 👋\n\n${userName} thân mến, em rất vui được hỗ trợ anh/chị.\n\n${aiResponse}\n\nEm có thể giúp gì thêm cho anh/chị không ạ? 😊`;
    }

    // Trích xuất intent từ câu trả lời
    const intentMatch = aiResponse.match(/\[intent: (.*?)\]/);
    const intent = intentMatch ? intentMatch[1] : 'hỏi_chung';

    // Save to chat history
    await supabase
      .from('chat_history')
      .insert([
        {
          user_id: userId,
          role: 'user',
          content: message,
          intent: intent,
          agent_name: agent_name
        },
        {
          user_id: userId,
          role: 'assistant',
          content: aiResponse,
          intent: intent,
          agent_name: agent_name
        }
      ]);

    return { 
      response: aiResponse,
      intent: intent,
      agent: {
        name: agent.name,
        description: agent.description,
        icon: agent.icon
      }
    };

  } catch (error) {
    console.error('Error:', error);
    throw error;
  }
}

// Add AI General prompt template
const generalAgentPrompt = `Bạn là AI Tổng của công ty bảo hiểm. Bạn sẽ trả lời các câu hỏi chung và định hướng người dùng đến đúng bộ phận.

Hướng dẫn trả lời:
1. Luôn bắt đầu bằng lời chào thân thiện với tên và vai trò của người dùng
2. Sử dụng ngôn ngữ trang trọng, lịch sự
3. Thêm emoji phù hợp để tạo cảm giác thân thiện
4. Kết thúc bằng lời đề nghị hỗ trợ thêm
5. Phân tích intent của câu hỏi và thêm nhãn intent vào cuối câu trả lời

Các intent có thể có:
- hỏi_chung: Câu hỏi chung về công ty
- hỏi_định_hướng: Câu hỏi cần định hướng đến bộ phận khác
- hỏi_sai_phạm_vi: Câu hỏi không thuộc phạm vi xử lý
- hỏi_chào_hỏi: Câu hỏi chào hỏi, xã giao`;

// Start server
app.listen(port, () => {
  console.log(`TROLYLIENVIET Server is running on port ${port}`);
});

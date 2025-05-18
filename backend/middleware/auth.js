import jwt from 'jsonwebtoken';
import supabase from '../supabase.js';

export const auth = async (req, res, next) => {
  try {
    // Lấy token từ header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Không tìm thấy token' });
    }

    const token = authHeader.split(' ')[1];

    // Xác thực token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Kiểm tra session trong database
    const { data: session, error: sessionError } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('token', token)
      .single();

    if (sessionError || !session) {
      return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ' });
    }

    // Kiểm tra token hết hạn
    if (new Date(session.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Token đã hết hạn' });
    }

    // Lấy thông tin user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select(`
        id,
        email,
        full_name,
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

    // Thêm thông tin user vào request
    req.user = {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.roles.name,
      roleDescription: user.roles.description
    };

    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token không hợp lệ' });
    }
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token đã hết hạn' });
    }
    res.status(500).json({ error: 'Lỗi xác thực' });
  }
}; 
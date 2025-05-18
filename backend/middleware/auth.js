import jwt from 'jsonwebtoken';
import supabase from '../supabase.js';

export const auth = async (req, res, next) => {
  try {
    // Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Không tìm thấy token xác thực' });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if session exists and is valid
    const { data: session, error: sessionError } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('token', token)
      .eq('user_id', decoded.userId)
      .single();

    if (sessionError || !session || new Date(session.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn' });
    }

    // Get user
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*, roles(name)')
      .eq('id', decoded.userId)
      .single();

    if (userError || !user) {
      return res.status(401).json({ error: 'Người dùng không tồn tại' });
    }

    // Check if user is active
    if (!user.is_active) {
      return res.status(401).json({ error: 'Tài khoản đã bị khóa' });
    }

    // Add user to request
    req.user = {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.roles.name
    };

    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: 'Token không hợp lệ' });
  }
}; 
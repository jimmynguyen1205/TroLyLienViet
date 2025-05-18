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

    // Check if token exists in database
    const { data: session, error: sessionError } = await supabase
      .from('user_sessions')
      .select('*')
      .eq('token', token)
      .single();

    if (sessionError || !session) {
      return res.status(401).json({ error: 'Phiên đăng nhập không hợp lệ' });
    }

    // Check if token is expired
    if (new Date(session.expires_at) < new Date()) {
      return res.status(401).json({ error: 'Phiên đăng nhập đã hết hạn' });
    }

    // Check if device matches
    if (session.device_info !== req.headers['user-agent']) {
      return res.status(401).json({ error: 'Thiết bị không khớp với phiên đăng nhập' });
    }

    // Update last activity
    await supabase
      .from('user_sessions')
      .update({ last_activity: new Date() })
      .eq('token', token);

    // Get user info
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

    // Check if user is active
    if (!user.is_active) {
      return res.status(401).json({ error: 'Tài khoản đã bị khóa' });
    }

    // Add user info to request
    req.user = {
      id: user.id,
      email: user.email,
      fullName: user.full_name,
      role: user.roles.name,
      roleDescription: user.roles.description
    };

    next();
  } catch (error) {
    console.error('Auth error:', error);
    res.status(401).json({ error: 'Xác thực thất bại' });
  }
}; 
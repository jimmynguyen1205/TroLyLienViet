import express from 'express';
import supabase from '../supabase.js';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';

const router = express.Router();

// JWT secret key
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

// Login route (chỉ dùng email)
router.post('/login', [
  body('email').isEmail().withMessage('Email không hợp lệ')
], async (req, res) => {
  console.log('Login request body:', req.body);
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;
    if (!email) {
      return res.status(400).json({ message: 'Email là bắt buộc' });
    }

    // Truy vấn người dùng theo email
    const { data: users, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .limit(1);

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }

    const user = users[0];
    if (!user) {
      return res.status(404).json({ message: 'Không tìm thấy người dùng' });
    }

    if (user.status === 'pending') {
      return res.status(403).json({ message: 'Tài khoản đang chờ duyệt' });
    }

    if (user.status === 'rejected') {
      return res.status(403).json({ message: 'Tài khoản đã bị từ chối' });
    }

    if (user.status !== 'approved') {
      return res.status(403).json({ message: 'Tài khoản chưa được phê duyệt' });
    }

    // Tạo JWT token
    const token = jwt.sign(
      {
        userId: user.id,
        email: user.email,
        role: user.role_id
      },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Ghi lại phiên đăng nhập (tùy chọn)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    const { error: sessionError } = await supabase
      .from('user_sessions')
      .insert([{
        user_id: user.id,
        token,
        expires_at: expiresAt,
        device_info: req.headers['user-agent'],
        ip_address: req.ip
      }]);

    if (sessionError) {
      console.error('Error creating session:', sessionError);
    }

    // Gửi phản hồi
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        roleId: user.role_id
      }
    });

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Lỗi nội bộ server' });
  }
});

export default router;

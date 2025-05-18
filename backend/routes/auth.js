import express from 'express';
import supabase from '../supabase.js';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import cors from 'cors';

const router = express.Router();

// Login endpoint
router.post('/login', [
  body('email').isEmail().withMessage('Email không hợp lệ')
], async (req, res) => {
  try {
    // Validate request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { email } = req.body;

    // Get user from Supabase with role and manager info
    const { data: user, error: userError } = await supabase
      .from('users')
      .select(`
        id,
        full_name,
        roles (
          name
        ),
        manager_id
      `)
      .eq('email', email)
      .single();

    if (userError || !user) {
      return res.status(401).json({ error: 'Không tìm thấy người dùng' });
    }

    // Return user info
    res.json({
      user: {
        id: user.id,
        fullName: user.full_name,
        role: user.roles.name,
        managerId: user.manager_id
      }
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Register endpoint
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

export default router; 
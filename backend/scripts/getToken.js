import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import supabase from '../supabase.js';

// Load environment variables
dotenv.config();

async function getToken() {
  try {
    // Get user from database with role info
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
      .eq('email', 'test@gmail.com')
      .single();

    if (userError) {
      console.error('Error finding user:', userError);
      return;
    }

    // Create token with correct payload structure
    const token = jwt.sign(
      { 
        userId: user.id,
        email: user.email,
        role: user.roles.name
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Create session in database
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24);

    const { error: sessionError } = await supabase
      .from('user_sessions')
      .insert([{
        user_id: user.id,
        token: token,
        expires_at: expiresAt
      }]);

    if (sessionError) {
      console.error('Error creating session:', sessionError);
      return;
    }

    console.log('Token:', token);

  } catch (error) {
    console.error('Error:', error);
  }
}

getToken(); 
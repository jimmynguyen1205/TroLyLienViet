import bcrypt from 'bcrypt';
import supabase from '../supabase.js';

async function testLogin() {
  try {
    // Get user by email
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('email', 'test@gmail.com')
      .single();

    if (userError) {
      console.error('Error finding user:', userError);
      return;
    }

    if (!user) {
      console.error('User not found');
      return;
    }

    // Test password
    const password = '123456';
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      console.error('Invalid password');
      return;
    }

    console.log('Login successful!');
    console.log('User details:', {
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role_id: user.role_id
    });

  } catch (error) {
    console.error('Error:', error);
  }
}

testLogin(); 
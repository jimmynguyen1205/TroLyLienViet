import bcrypt from 'bcrypt';
import supabase from '../supabase.js';

async function createUser() {
  try {
    // Hash password
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash('123456', salt);

    // Create user
    const { data: user, error } = await supabase
      .from('users')
      .insert([
        {
          email: 'test@gmail.com',
          password_hash: passwordHash,
          full_name: 'Test User',
          role_id: 2 // Normal user role
        }
      ])
      .select()
      .single();

    if (error) {
      console.error('Error creating user:', error);
      return;
    }

    console.log('User created successfully:', user);

  } catch (error) {
    console.error('Error:', error);
  }
}

createUser(); 
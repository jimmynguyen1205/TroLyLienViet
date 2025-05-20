import bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import supabase from '../supabase.js';

dotenv.config();

const email = 'test@gmail.com';
const newPassword = '123456';

async function updatePassword() {
  try {
    // Hash password mới
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(newPassword, salt);

    // Update password trong database
    const { data, error } = await supabase
      .from('users')
      .update({ password_hash: passwordHash })
      .eq('email', email);

    if (error) {
      console.error('Error updating password:', error);
      return;
    }

    console.log('Password updated successfully for user:', email);
  } catch (error) {
    console.error('Error:', error);
  } finally {
    process.exit();
  }
}

updatePassword(); 
import supabase from './supabase.js';

async function testSupabaseConnection() {
  try {
    // Test kết nối cơ bản
    console.log('Testing Supabase connection...');
    
    // Kiểm tra bảng users
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*')
      .limit(5);

    if (usersError) {
      console.error('Error fetching users:', usersError);
      return;
    }

    console.log('Users in database:', users);

    // Kiểm tra bảng roles
    const { data: roles, error: rolesError } = await supabase
      .from('roles')
      .select('*');

    if (rolesError) {
      console.error('Error fetching roles:', rolesError);
      return;
    }

    console.log('Roles in database:', roles);

  } catch (error) {
    console.error('Unexpected error:', error);
  }
}

testSupabaseConnection(); 
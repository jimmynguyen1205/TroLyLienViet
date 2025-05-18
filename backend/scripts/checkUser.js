import supabase from '../supabase.js';

async function checkUser() {
  try {
    // Get all users
    const { data: users, error } = await supabase
      .from('users')
      .select(`
        *,
        roles (
          name,
          description
        )
      `);

    if (error) {
      console.error('Error getting users:', error);
      return;
    }

    console.log('Users in database:', users);

  } catch (error) {
    console.error('Error:', error);
  }
}

checkUser(); 
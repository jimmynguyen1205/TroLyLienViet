-- Reset password for tiasang09@gmail.com
SELECT update_user_password('tiasang09@gmail.com', '123456');

-- Verify the update
SELECT 
    email,
    status,
    password_hash,
    updated_at
FROM users 
WHERE email = 'tiasang09@gmail.com'; 
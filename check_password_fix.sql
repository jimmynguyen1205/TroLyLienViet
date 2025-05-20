-- Check table structure
SELECT 
    column_name, 
    data_type,
    column_default
FROM information_schema.columns 
WHERE table_name = 'users'
ORDER BY ordinal_position;

-- Check current user data
SELECT 
    email,
    LEFT(password_hash, 7) as hash_format,    -- Should show '$2a$08$' or similar
    LENGTH(password_hash) as hash_length,     -- Should be around 60 characters
    status,
    updated_at
FROM users 
WHERE email = 'tiasang09@gmail.com';

-- Test password verification
SELECT 
    u.email,
    u.status,
    CASE 
        WHEN u.password_hash = crypt('123456', u.password_hash) THEN 'Password matches'
        ELSE 'Password does not match'
    END as password_check
FROM users u
WHERE u.email = 'tiasang09@gmail.com'; 
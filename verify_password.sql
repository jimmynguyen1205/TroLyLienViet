-- Check if password hash has correct bcrypt format
SELECT 
    email,
    password_hash,
    LEFT(password_hash, 2) as hash_prefix,  -- Should start with '$2'
    LENGTH(password_hash) as hash_length    -- Should be around 60 characters
FROM users 
WHERE email = 'tiasang09@gmail.com';

-- Test password verification step by step
WITH user_data AS (
    SELECT 
        email,
        password_hash,
        status
    FROM users 
    WHERE email = 'tiasang09@gmail.com'
)
SELECT 
    email,
    status,
    password_hash = crypt('123456', password_hash) as password_matches,
    LENGTH(password_hash) as hash_length,
    LEFT(password_hash, 7) as hash_algorithm -- Should show '$2a$08$' or similar
FROM user_data; 
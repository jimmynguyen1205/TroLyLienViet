-- Check user status
SELECT 
    id,
    email,
    password_hash,
    status
FROM users 
WHERE email = 'tiasang09@gmail.com'; 

SELECT * FROM check_user_login('tiasang09@gmail.com', '123456'); 

SELECT 
    email,
    password_hash = crypt('123456', password_hash) as password_matches,
    status
FROM users 
WHERE email = 'tiasang09@gmail.com'; 
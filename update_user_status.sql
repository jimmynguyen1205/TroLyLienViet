-- Update user status to approved
UPDATE users 
SET 
    status = 'approved',
    updated_at = CURRENT_TIMESTAMP
WHERE email = 'tiasang09@gmail.com'
RETURNING email, status, updated_at; 
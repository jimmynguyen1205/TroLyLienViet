-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Drop existing functions if they exist
DROP FUNCTION IF EXISTS check_user_login CASCADE;
DROP FUNCTION IF EXISTS hash_password CASCADE;

-- Add updated_at column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'users' 
        AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE users 
        ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

-- First, let's check the current password hash format
SELECT email, password_hash FROM users WHERE email = 'tiasang09@gmail.com';

-- Create function to hash passwords
CREATE OR REPLACE FUNCTION hash_password(password TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN crypt(password, gen_salt('bf', 8));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update user's password with proper bcrypt hash
UPDATE users 
SET 
    password_hash = hash_password('123456'),
    updated_at = CURRENT_TIMESTAMP
WHERE email = 'tiasang09@gmail.com'
RETURNING email, password_hash;

-- Create or replace the login check function
CREATE OR REPLACE FUNCTION check_user_login(p_email VARCHAR, p_password VARCHAR)
RETURNS TABLE (
    user_id UUID,
    user_email VARCHAR,
    user_status account_status
) AS $$
BEGIN
    -- First verify the user exists
    IF NOT EXISTS (SELECT 1 FROM users WHERE email = p_email) THEN
        RETURN;
    END IF;

    -- Then check password and return user info
    RETURN QUERY
    SELECT 
        u.id,
        u.email,
        u.status
    FROM users u
    WHERE u.email = p_email
    AND u.password_hash = crypt(p_password, u.password_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Test the login
SELECT * FROM check_user_login('tiasang09@gmail.com', '123456'); 
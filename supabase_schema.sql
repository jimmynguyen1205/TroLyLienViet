-- Drop existing objects if they exist
DO $$ BEGIN
    -- Drop trigger if exists
    IF EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_users_updated_at') THEN
        DROP TRIGGER IF EXISTS update_users_updated_at ON users;
    END IF;
    
    -- Drop function if exists
    DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;
    DROP FUNCTION IF EXISTS check_user_login CASCADE;
    
    -- Drop type if exists
    DROP TYPE IF EXISTS account_status CASCADE;
END $$;

-- Create enum for account status
CREATE TYPE account_status AS ENUM ('approved', 'pending', 'rejected');

-- Create users table if not exists
CREATE TABLE IF NOT EXISTS users (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    status account_status DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add status column to users table if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'users' AND column_name = 'status') THEN
        ALTER TABLE users ADD COLUMN status account_status DEFAULT 'pending';
    END IF;
    
    -- Add created_at if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'users' AND column_name = 'created_at') THEN
        ALTER TABLE users ADD COLUMN created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    END IF;
    
    -- Add updated_at if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                  WHERE table_name = 'users' AND column_name = 'updated_at') THEN
        ALTER TABLE users ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
    END IF;
END $$;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger for updated_at
CREATE TRIGGER update_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Enable the pgcrypto extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Create function to check user login
CREATE OR REPLACE FUNCTION check_user_login(p_email VARCHAR, p_password VARCHAR)
RETURNS TABLE (
    user_id UUID,
    user_email VARCHAR,
    user_status account_status
) AS $$
BEGIN
    -- First find the user by email only
    RETURN QUERY
    SELECT 
        u.id,
        u.email,
        u.status
    FROM users u
    WHERE u.email = p_email
    AND (
        -- Check both bcrypt and plain password (for migration)
        u.password_hash = crypt(p_password, u.password_hash)
        OR 
        u.password_hash = p_password
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update existing users to have approved status if they don't have a status
UPDATE users 
SET status = 'approved'
WHERE status IS NULL;

-- Function to update user password with proper hashing
CREATE OR REPLACE FUNCTION update_user_password(p_email VARCHAR, p_password VARCHAR)
RETURNS VOID AS $$
BEGIN
    UPDATE users
    SET password_hash = crypt(p_password, gen_salt('bf'))
    WHERE email = p_email;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 
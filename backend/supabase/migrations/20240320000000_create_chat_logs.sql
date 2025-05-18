-- Create chat_logs table
CREATE TABLE IF NOT EXISTS chat_logs (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS chat_logs_user_id_idx ON chat_logs(user_id);
CREATE INDEX IF NOT EXISTS chat_logs_agent_id_idx ON chat_logs(agent_id);
CREATE INDEX IF NOT EXISTS chat_logs_created_at_idx ON chat_logs(created_at);

-- Create RLS policies
ALTER TABLE chat_logs ENABLE ROW LEVEL SECURITY;

-- Users can only see their own chat logs
CREATE POLICY "Users can view their own chat logs"
  ON chat_logs FOR SELECT
  USING (auth.uid() = user_id);

-- Users can only insert their own chat logs
CREATE POLICY "Users can insert their own chat logs"
  ON chat_logs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can only delete their own chat logs
CREATE POLICY "Users can delete their own chat logs"
  ON chat_logs FOR DELETE
  USING (auth.uid() = user_id); 
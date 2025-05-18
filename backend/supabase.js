import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://cwyssoxbuadgypcnokcy.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImN3eXNzb3hidWFkZ3lwY25va2N5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDc1NTI4MjYsImV4cCI6MjA2MzEyODgyNn0.0kAeXRohHaLFb_HOlQpfAvMEGo_1U9UUIJKF4kjFrJI';

console.log('DEBUG SUPABASE_URL:', SUPABASE_URL);
console.log('DEBUG SUPABASE_ANON_KEY:', SUPABASE_ANON_KEY);

// Initialize Supabase client
const supabase = createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);

export default supabase; 
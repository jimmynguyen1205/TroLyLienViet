import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase credentials');
}

console.log('DEBUG SUPABASE_URL:', supabaseUrl);
console.log('DEBUG SUPABASE_ANON_KEY:', supabaseKey);

// Initialize Supabase client
const supabase = createClient(supabaseUrl, supabaseKey);

export default supabase; 
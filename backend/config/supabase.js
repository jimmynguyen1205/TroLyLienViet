import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

// if (!supabaseUrl || !supabaseKey) {
//   throw new Error('Missing Supabase credentials');
// }

const supabase = createClient(
  supabaseUrl || 'https://dummy.supabase.co',
  supabaseKey || 'dummy-key'
);

export { supabase }; 
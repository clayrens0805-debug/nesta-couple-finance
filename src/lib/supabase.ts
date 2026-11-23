import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const supabaseAnonKey = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();

export const isSupabaseConfigured = Boolean(
  (supabaseUrl.startsWith('https://') || supabaseUrl.startsWith('http://')) &&
  supabaseAnonKey &&
  !supabaseUrl.includes('your-project-id')
);

let client = null;
if (isSupabaseConfigured) {
  try {
    client = createClient(supabaseUrl, supabaseAnonKey);
  } catch {
    client = null;
  }
}

export const supabase = client;

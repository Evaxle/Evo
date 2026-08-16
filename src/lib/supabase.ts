import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase is only enabled when the Vite env vars are present
 * (set in Vercel project settings or a local .env file).
 */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL?.trim() || undefined;
export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || undefined;

export const supabase: SupabaseClient | null =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

export const cloudEnabled = supabase !== null;

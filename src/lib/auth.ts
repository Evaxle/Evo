import { supabase, cloudEnabled } from './supabase';
import type { User } from '@supabase/supabase-js';

/**
 * Username-only accounts. Supabase Auth is built around email addresses, so we
 * derive a stable synthetic email from the username (`<username>@evo.local`).
 * This keeps the sign-up form to just a username and password.
 *
 * The Supabase project must have email confirmation DISABLED
 * (Auth → Providers → Email → "Confirm email" off) so sign-up logs you in
 * immediately.
 */

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_.-]/g, '');
}

export function usernameToEmail(username: string): string {
  return `${normalizeUsername(username)}@evo.local`;
}

export function validateUsername(username: string): string | null {
  const clean = normalizeUsername(username);
  if (clean.length < 3 || clean.length > 20) {
    return 'Username must be 3–20 characters (letters, numbers, . _ -)';
  }
  if (clean !== username.trim().toLowerCase()) {
    return 'Username may only contain lowercase letters, numbers, . _ and -';
  }
  return null;
}

export function validatePassword(password: string): string | null {
  if (password.length < 6) return 'Password must be at least 6 characters';
  return null;
}

export interface AuthResult {
  ok: boolean;
  error?: string;
  user?: User;
  needsConfirmation?: boolean;
}

export async function register(
  username: string,
  password: string,
): Promise<AuthResult> {
  if (!cloudEnabled) return { ok: false, error: 'Cloud saving is not configured yet.' };
  if (!supabase) return { ok: false, error: 'Cloud saving is not configured yet.' };

  const nameError = validateUsername(username);
  if (nameError) return { ok: false, error: nameError };
  const passError = validatePassword(password);
  if (passError) return { ok: false, error: passError };

  const clean = normalizeUsername(username);
  const email = usernameToEmail(clean);

  try {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { username: clean } },
    });

    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('already') || msg.includes('registered')) {
        return { ok: false, error: 'That username is already taken.' };
      }
      return { ok: false, error: error.message };
    }

    // Create the public profile row (used for display + GitHub link storage).
    if (data.user) {
      await supabase
        .from('profiles')
        .upsert({ id: data.user.id, username: clean, email }, { onConflict: 'id' });
    }

    // If email confirmation is on, auto-confirm by signing in directly.
    if (!data.session) {
      await supabase.auth.signInWithPassword({ email, password });
    }
    return { ok: true, user: data.user ?? undefined };
  } catch (err) {
    console.error('register:', err);
    return {
      ok: false,
      error: 'Could not reach the server. Check your connection and try again.',
    };
  }
}

export async function login(username: string, password: string): Promise<AuthResult> {
  if (!cloudEnabled || !supabase) {
    return { ok: false, error: 'Cloud saving is not configured yet.' };
  }
  const clean = normalizeUsername(username);
  const email = usernameToEmail(clean);

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('invalid login') || msg.includes('invalid credentials')) {
        return { ok: false, error: 'Incorrect username or password.' };
      }
      return { ok: false, error: error.message };
    }
    return { ok: true, user: data.user ?? undefined };
  } catch (err) {
    console.error('login:', err);
    return {
      ok: false,
      error: 'Could not reach the server. Check your connection and try again.',
    };
  }
}

export async function logout(): Promise<void> {
  await supabase?.auth.signOut();
}

export async function getSessionUser(): Promise<User | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.user ?? null;
}

export function onAuthStateChange(cb: (user: User | null) => void): () => void {
  if (!supabase) {
    cb(null);
    return () => {};
  }
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    cb(session?.user ?? null);
  });
  return () => data.subscription.unsubscribe();
}

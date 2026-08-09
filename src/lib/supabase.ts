import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Supabase client.
 *
 * Deliberately optional: with no env vars the app runs entirely on Dexie, which
 * makes it usable on one device before any backend exists. Every call site here
 * degrades to a no-op rather than throwing.
 */

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      })
    : null;

export function isSupabaseConfigured(): boolean {
  return supabase !== null;
}

export async function sendMagicLink(email: string): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!supabase) return { ok: true }; // Local-only mode — nothing to send.
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function getUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session;
}

/**
 * Find a household this user already belongs to.
 *
 * Covers the case where someone signs in on a second device, reinstalls, or
 * clears their browser: without this they'd be walked through onboarding again
 * and end up creating a duplicate household alongside the real one.
 */
export async function findExistingHousehold(userId: string): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('household_members')
    .select('household_id')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .limit(1);
  if (error || !data?.length) return null;
  return data[0].household_id as string;
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut();
}

/**
 * Redeem an invite. A not-yet-member can't read or write the household under RLS,
 * so this goes through a SECURITY DEFINER function — the schema's only privileged
 * escape hatch.
 */
export async function redeemInvite(code: string): Promise<{ ok: boolean; householdId?: string; error?: string }> {
  if (!supabase) return { ok: false, error: 'Not connected to a backend yet.' };
  const { data, error } = await supabase.rpc('redeem_invite', { invite_code: code });
  if (error) return { ok: false, error: error.message };
  return { ok: true, householdId: data as string };
}

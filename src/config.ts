/**
 * Supabase connection. The publishable (anon) key is public by design;
 * data is protected by Row Level Security. Can be overridden at build time.
 */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://ukdotyhxyusitplocgod.supabase.co';
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY || '';

export const cloudConfigured = () => !!SUPABASE_URL && !!SUPABASE_KEY;

/** Usernames are mapped to internal addresses on this domain (no emails are sent). */
export const USERNAME_DOMAIN = 'timeclock.local';

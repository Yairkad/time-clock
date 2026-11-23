/**
 * Supabase connection. The publishable (anon) key is public by design;
 * data is protected by Row Level Security. Can be overridden at build time.
 */
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://ukdotyhxyusitplocgod.supabase.co';
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY ||
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVrZG90eWh4eXVzaXRwbG9jZ29kIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU0NTc0MTksImV4cCI6MjExMTAzMzQxOX0.U5_7V7pEYzCv4BElsz_i21j-7Odi3avi0fZI1p3OiCo';

export const cloudConfigured = () => !!SUPABASE_URL && !!SUPABASE_KEY;

/** Usernames are mapped to internal addresses on this domain (no emails are sent). */
export const USERNAME_DOMAIN = 'timeclock.local';

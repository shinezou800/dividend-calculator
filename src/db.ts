import { createClient } from '@supabase/supabase-js';
import type { Holding } from './calc';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = url && key && url !== '__PENDING__' && key !== '__PENDING__' ? createClient(url, key, { auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true } }) : null;
export async function loadHoldings(): Promise<Holding[]> {
  if (!supabase) throw new Error('未配置 Supabase');
  const result = await supabase.from('holdings').select('*').order('sort').order('id');
  if (result.error) throw result.error;
  return result.data as Holding[];
}
export const canEdit = (loggedIn: boolean, admin: boolean) => loggedIn && admin;

// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';

it('真实Supabase客户端从魔法链接片段恢复会话并保留Pages子路径', async () => {
  const user = { id: '11111111-1111-4111-8111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'owner@example.com', app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString() };
  const payload = btoa(JSON.stringify({ sub: user.id, role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).replace(/=+$/, '');
  const accessToken = `eyJhbGciOiJIUzI1NiJ9.${payload}.ZmFrZS1zaWduYXR1cmU`;
  const fetchUser = vi.fn(async () => new Response(JSON.stringify(user), { status: 200, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetchUser);
  vi.stubEnv('VITE_SUPABASE_URL', 'https://magic-link-test.supabase.co');
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'public-test-key');
  window.history.replaceState({}, '', `/dividend-calculator/#access_token=${accessToken}&refresh_token=fake-refresh-token&expires_in=3600&token_type=bearer&type=magiclink`);
  const { supabase } = await import('./db');
  try {
    const { data, error } = await supabase!.auth.getSession();
    expect(error).toBeNull();
    expect(data.session?.user.id).toBe(user.id);
    expect(fetchUser).toHaveBeenCalled();
    expect(window.location.pathname).toBe('/dividend-calculator/');
    expect(window.location.hash).toBe('');
  } finally {
    await supabase!.auth.stopAutoRefresh();
    localStorage.clear();
    window.history.replaceState({}, '', '/');
    vi.unstubAllEnvs(); vi.unstubAllGlobals();
  }
});

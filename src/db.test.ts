import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ createClient: vi.fn(), from: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.clearAllMocks(); });
describe('公开持仓读取', () => {
  it.each([
    ['__PENDING__', '__PENDING__'],
    ['__PENDING__', '公共密钥'],
    ['https://example.supabase.co', '__PENDING__'],
  ])('生产配置包含占位符时禁用客户端：%s / %s', async (url, key) => {
    vi.stubEnv('VITE_SUPABASE_URL', url); vi.stubEnv('VITE_SUPABASE_ANON_KEY', key);
    const { loadHoldings, supabase } = await import('./db');
    expect(supabase).toBeNull();
    await expect(loadHoldings()).rejects.toThrow('未配置');
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it('缺少配置时明确失败，不回退本地数据', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', ''); vi.stubEnv('VITE_SUPABASE_ANON_KEY', '');
    const { loadHoldings, supabase } = await import('./db');
    expect(supabase).toBeNull();
    await expect(loadHoldings()).rejects.toThrow('未配置');
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
  it.each([{ rows: [] }, { rows: [{ id: '示例' }] }])('访客无需登录即可读取，包括空持仓：%j', async ({ rows }) => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co'); vi.stubEnv('VITE_SUPABASE_ANON_KEY', '公共密钥');
    const order = vi.fn(); order.mockReturnValueOnce({ order }).mockResolvedValueOnce({ data: rows, error: null });
    mocks.from.mockReturnValue({ select: vi.fn(() => ({ order })) });
    mocks.createClient.mockReturnValue({ from: mocks.from });
    const { loadHoldings } = await import('./db');
    await expect(loadHoldings()).resolves.toEqual(rows);
    expect(mocks.from).toHaveBeenCalledWith('holdings');
    expect(mocks.createClient).toHaveBeenCalledWith('https://example.supabase.co', '公共密钥', { auth: { flowType: 'implicit', detectSessionInUrl: true, persistSession: true, autoRefreshToken: true } });
  });
  it('查询失败不伪造默认数据', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://example.supabase.co'); vi.stubEnv('VITE_SUPABASE_ANON_KEY', '公共密钥');
    const order = vi.fn(); order.mockReturnValueOnce({ order }).mockResolvedValueOnce({ data: null, error: new Error('网络失败') });
    mocks.from.mockReturnValue({ select: vi.fn(() => ({ order })) });
    mocks.createClient.mockReturnValue({ from: mocks.from });
    const { loadHoldings } = await import('./db');
    await expect(loadHoldings()).rejects.toThrow('网络失败');
  });
});

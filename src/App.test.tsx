// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import { defaults, type Holding } from './calc';

const mocks = vi.hoisted(() => ({
  load: vi.fn(), update: vi.fn(), rpc: vi.fn(), getSession: vi.fn(), sendOtp: vi.fn(), verifyOtp: vi.fn(),
  authChange: undefined as undefined | ((event: string, session: { user: { id: string } } | null) => void),
}));
vi.mock('./db', () => ({
  canEdit: (loggedIn: boolean, admin: boolean) => loggedIn && admin,
  loadHoldings: mocks.load,
  supabase: {
    rpc: mocks.rpc,
    auth: {
      getSession: mocks.getSession,
      signInWithOtp: mocks.sendOtp,
      verifyOtp: mocks.verifyOtp,
      onAuthStateChange: (callback: typeof mocks.authChange) => { mocks.authChange = callback; return { data: { subscription: { unsubscribe() {} } } }; },
    },
    from: () => ({ update: mocks.update }),
  },
}));

let serverRow: Holding;
beforeEach(() => {
  vi.useFakeTimers();
  serverRow = { id: 'stock', code: '601318', name: '平安', shares: 5000, price: 55.46, dps: 2.7, dps_note: null, sort: 0 };
  mocks.load.mockImplementation(async () => [{ ...serverRow }]);
  mocks.rpc.mockResolvedValue({ data: true, error: null });
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'owner' } } } });
  mocks.sendOtp.mockResolvedValue({ error: null });
  mocks.verifyOtp.mockResolvedValue({ error: null });
  mocks.update.mockImplementation((patch: Partial<Holding>) => ({ eq: () => ({ select: () => ({ single: async () => { serverRow = { ...serverRow, ...patch }; return { data: { id: serverRow.id }, error: null }; } }) }) }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); window.history.replaceState({}, '', '/'); });
const tick = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
async function auth(loggedIn: boolean) {
  act(() => mocks.authChange!(loggedIn ? 'SIGNED_IN' : 'SIGNED_OUT', loggedIn ? { user: { id: 'owner' } } : null));
  await tick();
}

it('编辑股数即时更新月表及三处合计，保存后保持一致', async () => {
  mocks.load.mockImplementation(async () => defaults.map((h, i) => i === 0 ? { ...serverRow } : { ...h, id: h.code, sort: i }));
  render(<App />); await tick();
  expect(screen.getAllByText('约 ¥20,956.00')).toHaveLength(2);
  expect(screen.getByText('约 ¥21,994.00')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('平安股数'), { target: { value: '6000' } });
  expect(mocks.update).not.toHaveBeenCalled();
  expect(screen.getByText('2027-06').parentElement!.textContent).toContain('约 ¥12,003.00');
  expect(screen.getByText('2027-10').parentElement!.textContent).toContain('约 ¥5,700.00');
  expect(screen.getByText('平安末期10500 + 兴业末期1503')).toBeTruthy();
  expect(screen.getAllByText('约 ¥23,656.00')).toHaveLength(2);
  expect(screen.getByText('约 ¥24,694.00')).toBeTruthy();
  expect(screen.getByText('年分红约 ¥22,780')).toBeTruthy();
  await tick(600);
  expect(serverRow.shares).toBe(6000);
  expect(screen.getAllByText('约 ¥23,656.00')).toHaveLength(2);
  expect(screen.getByText('约 ¥24,694.00')).toBeTruthy();
});

it('修改每股分红即使保存失败也保留当前月表测算', async () => {
  mocks.update.mockImplementationOnce(() => ({ eq: () => ({ select: () => ({ single: async () => ({ error: new Error('网络失败') }) }) }) }));
  render(<App />); await tick();
  fireEvent.change(screen.getByLabelText('平安每股分红（元）'), { target: { value: '5.4' } });
  expect(screen.getByText('2027-06').parentElement!.textContent).toContain('约 ¥17,500.00');
  await tick(600);
  expect(screen.getByText('保存失败')).toBeTruthy();
  expect(screen.getAllByText('约 ¥27,000.00')).toHaveLength(3);
});

it('月表列出无到账配置的持仓而不虚构月份', async () => {
  mocks.load.mockResolvedValueOnce([{ ...serverRow, code: '123456', name: '新股票' }]);
  render(<App />); await tick();
  expect(screen.getByText('新股票（123456）：未配置到账月份，不计入按月表')).toBeTruthy();
  expect(screen.getAllByText('约 ¥0.00')).toHaveLength(3);
});

it('保存后重新登录不能将保留的旧行覆盖另一浏览器的新持仓', async () => {
  render(<App />); await tick();
  fireEvent.change(screen.getByLabelText('平安股数'), { target: { value: '5001' } });
  await tick(600);
  expect(serverRow.shares).toBe(5001);
  expect(mocks.update).toHaveBeenCalledTimes(1);
  await auth(false);
  serverRow.shares = 8000;
  await auth(true);
  await tick(1000);
  expect(mocks.update).toHaveBeenCalledTimes(1);
  expect(serverRow.shares).toBe(8000);
  expect((screen.getByLabelText('平安股数') as HTMLInputElement).value).toBe('8000');
  fireEvent.change(screen.getByLabelText('平安股数'), { target: { value: '8001' } });
  await tick(600);
  expect(mocks.update).toHaveBeenCalledTimes(2);
  expect(serverRow.shares).toBe(8001);
});

it('未编辑的会话与空持仓不会触发保存', async () => {
  mocks.load.mockResolvedValueOnce([]);
  render(<App />); await tick(1000);
  expect(screen.getByText('暂无持仓，点击「添加股票」开始记录。')).toBeTruthy();
  await auth(false); await auth(true); await tick(1000);
  expect(mocks.update).not.toHaveBeenCalled();
});

it('离开编辑会话取消尚未发出的防抖保存', async () => {
  render(<App />); await tick();
  fireEvent.change(screen.getByLabelText('平安股数'), { target: { value: '5001' } });
  await auth(false);
  serverRow.shares = 8000;
  await auth(true); await tick(1000);
  expect(mocks.update).not.toHaveBeenCalled();
  expect(serverRow.shares).toBe(8000);
  expect((screen.getByLabelText('平安股数') as HTMLInputElement).value).toBe('8000');
});

it('上一会话的异步失败不能污染新会话状态', async () => {
  let finish!: (value: { error: Error }) => void;
  mocks.update.mockImplementationOnce(() => ({ eq: () => ({ select: () => ({ single: () => new Promise(resolve => { finish = resolve; }) }) }) }));
  render(<App />); await tick();
  fireEvent.change(screen.getByLabelText('平安股数'), { target: { value: '5001' } });
  await tick(600);
  await auth(false); await auth(true);
  await act(async () => { finish({ error: new Error('旧请求失败') }); });
  await tick(1000);
  expect(screen.queryByText('重试保存')).toBeNull();
  expect(mocks.update).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText('平安股数'), { target: { value: '6000' } });
  await tick(600);
  expect(serverRow.shares).toBe(6000);
});

it('当前编辑会话保存失败后可显式重试', async () => {
  mocks.update.mockImplementationOnce(() => ({ eq: () => ({ select: () => ({ single: async () => ({ error: new Error('网络失败') }) }) }) }));
  render(<App />); await tick();
  fireEvent.change(screen.getByLabelText('平安股数'), { target: { value: '6000' } });
  await tick(600);
  expect(serverRow.shares).toBe(5000);
  fireEvent.click(screen.getByText('重试保存'));
  await tick(600);
  expect(serverRow.shares).toBe(6000);
  expect(mocks.update).toHaveBeenCalledTimes(2);
});

it('登录后重新读取失败时保持只读，不允许编辑旧数据', async () => {
  render(<App />); await tick();
  await auth(false);
  mocks.load.mockRejectedValueOnce(new Error('读取失败'));
  await auth(true); await tick(1000);
  expect(screen.queryByLabelText('平安股数')).toBeNull();
  expect(screen.getByRole('alert').textContent).toContain('数据加载失败');
  expect(mocks.update).not.toHaveBeenCalled();
});

it('同一用户重复登录事件不重置正在编辑的会话', async () => {
  render(<App />); await tick();
  fireEvent.change(screen.getByLabelText('平安股数'), { target: { value: '6000' } });
  await auth(true); await tick(600);
  expect(mocks.load).toHaveBeenCalledTimes(1);
  expect(mocks.update).toHaveBeenCalledTimes(1);
  expect(serverRow.shares).toBe(6000);
});

it('快速退出并重新登录仍丢弃旧会话的待保存修改', async () => {
  render(<App />); await tick();
  fireEvent.change(screen.getByLabelText('平安股数'), { target: { value: '6000' } });
  act(() => {
    mocks.authChange!('SIGNED_OUT', null);
    mocks.authChange!('SIGNED_IN', { user: { id: 'owner' } });
  });
  await tick(1000);
  expect(mocks.update).not.toHaveBeenCalled();
  expect((screen.getByLabelText('平安股数') as HTMLInputElement).value).toBe('5000');
});

it('管理员首次读取失败后重新加载成功恢复编辑，不自动保存旧行', async () => {
  mocks.load.mockRejectedValueOnce(new Error('首次读取失败'));
  render(<App />); await tick();
  expect(mocks.rpc).toHaveBeenCalledWith('is_admin');
  expect(screen.queryByLabelText('平安股数')).toBeNull();
  serverRow.shares = 8000;
  fireEvent.click(screen.getByText('重新加载'));
  await tick(1000);
  expect((screen.getByLabelText('平安股数') as HTMLInputElement).value).toBe('8000');
  expect(screen.queryByRole('alert')).toBeNull();
  expect(mocks.update).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('平安股数'), { target: { value: '8001' } });
  await tick(600);
  expect(serverRow.shares).toBe(8001);
  expect(mocks.update).toHaveBeenCalledTimes(1);
});

it('非管理员读取失败后重新加载成功仍保持只读', async () => {
  mocks.rpc.mockResolvedValue({ data: false, error: null });
  mocks.load.mockRejectedValueOnce(new Error('首次读取失败'));
  render(<App />); await tick();
  fireEvent.click(screen.getByText('重新加载'));
  await tick(1000);
  expect(screen.queryByLabelText('平安股数')).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
  expect(screen.getByText('该账号无编辑权限')).toBeTruthy();
  expect(mocks.update).not.toHaveBeenCalled();
});

it('管理员重试读取仍失败时不会开放编辑', async () => {
  mocks.load.mockRejectedValueOnce(new Error('首次读取失败')).mockRejectedValueOnce(new Error('重试失败'));
  render(<App />); await tick();
  fireEvent.click(screen.getByText('重新加载'));
  await tick(1000);
  expect(screen.queryByLabelText('平安股数')).toBeNull();
  expect(screen.getByRole('alert').textContent).toContain('数据加载失败');
  expect(mocks.update).not.toHaveBeenCalled();
});

it('重新加载未结束时退出，迟到的管理员结果不能恢复编辑或覆盖新持仓', async () => {
  let finish!: (rows: Holding[]) => void;
  mocks.load.mockRejectedValueOnce(new Error('首次读取失败'));
  render(<App />); await tick();
  mocks.load.mockImplementationOnce(() => new Promise<Holding[]>(resolve => { finish = resolve; }));
  fireEvent.click(screen.getByText('重新加载')); await tick();
  await auth(false);
  await act(async () => { finish([{ ...serverRow, shares: 9999 }]); });
  await tick(1000);
  expect(screen.queryByLabelText('平安股数')).toBeNull();
  expect(screen.getByText('管理员登录')).toBeTruthy();
  expect(screen.queryByText('9,999')).toBeNull();
  expect(mocks.update).not.toHaveBeenCalled();
});

it('发送登录链接保留Pages子路径，验证码为空时不要求验证码或发起验证', async () => {
  window.history.replaceState({}, '', '/dividend-calculator/?tracking=1#old');
  mocks.getSession.mockResolvedValue({ data: { session: null } });
  render(<App />); await tick();
  fireEvent.click(screen.getByText('管理员登录'));
  fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'owner@example.com' } });
  fireEvent.click(screen.getByText('发送登录邮件')); await tick();
  expect(mocks.sendOtp).toHaveBeenCalledWith({ email: 'owner@example.com', options: { shouldCreateUser: false, emailRedirectTo: `${window.location.origin}/dividend-calculator/` } });
  expect(screen.getByText('登录邮件已发送，请打开邮箱并点击邮件中的登录链接，返回本页后将自动登录。')).toBeTruthy();
  expect((screen.getByLabelText('六位验证码') as HTMLInputElement).required).toBe(false);
  expect((screen.getByText('使用验证码登录') as HTMLButtonElement).disabled).toBe(true);
  expect(mocks.verifyOtp).not.toHaveBeenCalled();
  await auth(true);
  expect(screen.getByLabelText('平安股数')).toBeTruthy();
  expect(window.location.pathname).toBe('/dividend-calculator/');
});

it('邮件中有验证码时仍可选择验证码登录', async () => {
  mocks.getSession.mockResolvedValue({ data: { session: null } });
  render(<App />); await tick();
  fireEvent.click(screen.getByText('管理员登录'));
  fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'owner@example.com' } });
  fireEvent.click(screen.getByText('发送登录邮件')); await tick();
  fireEvent.change(screen.getByLabelText('六位验证码'), { target: { value: '123456' } });
  fireEvent.click(screen.getByText('使用验证码登录')); await tick();
  expect(mocks.verifyOtp).toHaveBeenCalledWith({ email: 'owner@example.com', token: '123456', type: 'email' });
});

it('登录邮件发送失败时显示错误并允许重试', async () => {
  mocks.getSession.mockResolvedValue({ data: { session: null } });
  mocks.sendOtp.mockResolvedValueOnce({ error: new Error('发送失败') });
  render(<App />); await tick();
  fireEvent.click(screen.getByText('管理员登录'));
  fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'owner@example.com' } });
  fireEvent.click(screen.getByText('发送登录邮件')); await tick();
  expect(screen.getByText('发送失败，请检查邮箱、网络或联系管理员。')).toBeTruthy();
  expect(screen.getByText('发送登录邮件')).toBeTruthy();
  expect(screen.queryByLabelText('六位验证码')).toBeNull();
});

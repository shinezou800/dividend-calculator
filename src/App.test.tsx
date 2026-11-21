// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import type { Holding } from './calc';

const mocks = vi.hoisted(() => ({
  load: vi.fn(), update: vi.fn(), rpc: vi.fn(),
  authChange: undefined as undefined | ((event: string, session: { user: { id: string } } | null) => void),
}));
vi.mock('./db', () => ({
  canEdit: (loggedIn: boolean, admin: boolean) => loggedIn && admin,
  loadHoldings: mocks.load,
  supabase: {
    rpc: mocks.rpc,
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'owner' } } } }),
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
  mocks.update.mockImplementation((patch: Partial<Holding>) => ({ eq: () => ({ select: () => ({ single: async () => { serverRow = { ...serverRow, ...patch }; return { data: { id: serverRow.id }, error: null }; } }) }) }));
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });
const tick = async (ms = 0) => { await act(async () => { await vi.advanceTimersByTimeAsync(ms); }); };
async function auth(loggedIn: boolean) {
  act(() => mocks.authChange!(loggedIn ? 'SIGNED_IN' : 'SIGNED_OUT', loggedIn ? { user: { id: 'owner' } } : null));
  await tick();
}

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

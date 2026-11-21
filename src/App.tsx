import { useEffect, useRef, useState } from 'react';
import { annual, dividendYield, monthlyPayouts, totals, type Holding } from './calc';
import { canEdit, loadHoldings, supabase } from './db';

const money = (n: number) => n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const percent = (n: number) => `${(n * 100).toFixed(2)}%`;
const disclaimer = '税前测算，A股股息按持股期限差别扣税；模拟盘记录，不构成投资建议；2026年度分红方案未全部公布，以公司公告为准';
type SaveState = '保存中' | '已保存' | '保存失败';

function StockCard({ row, editable, authSession, onChange, onDelete, onStatus }: { row: Holding; editable: boolean; authSession: { readonly current: number }; onChange: (h: Holding) => void; onDelete: () => void; onStatus: (id: string, s: SaveState) => void }) {
  const [status, setStatus] = useState<SaveState>('已保存');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const queue = useRef(Promise.resolve());
  const session = useRef(0);
  const pending = useRef<Holding | null>(null);
  const latest = useRef(0);
  const report = (s: SaveState) => { setStatus(s); onStatus(row.id, s); };
  useEffect(() => {
    session.current += 1;
    pending.current = null;
    report('已保存');
    return () => {
      session.current += 1;
      clearTimeout(timer.current);
      pending.current = null;
    };
  }, [editable]);
  function save(next: Holding) {
    if (!editable) return;
    const version = ++latest.current;
    const editSession = session.current;
    const authVersion = authSession.current;
    const isCurrent = () => editSession === session.current && version === latest.current && authVersion === authSession.current;
    pending.current = next;
    report('保存中');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      queue.current = queue.current.then(async () => {
        if (!isCurrent()) return;
        try {
          const result = await supabase!.from('holdings').update({ shares: next.shares, price: next.price, dps: next.dps, updated_at: new Date().toISOString() }).eq('id', next.id).select('id').single();
          if (result.error) throw result.error;
          if (isCurrent()) {
            pending.current = null;
            report('已保存');
          }
        } catch { if (isCurrent()) report('保存失败'); }
      });
    }, 600);
  }
  function edit(field: 'shares' | 'price' | 'dps', value: string) {
    const number = Number(value);
    if (!Number.isFinite(number) || number < 0) return;
    const next = { ...row, [field]: number };
    onChange(next);
    save(next);
  }
  return <article className="stock-card">
    <div className="stock-heading"><div><h3>{row.name} <span>{row.code}</span></h3><p>{row.dps_note || '自定义持仓'}</p></div>{editable && <button className="delete" disabled={status === '保存中'} onClick={onDelete} aria-label={`删除${row.name}`}>删除</button>}</div>
    <div className="stock-inputs">{([['shares', '股数'], ['price', '价格（元）'], ['dps', '每股分红（元）']] as const).map(([field, label]) => <label key={field}>{label}{editable ? <input aria-label={`${row.name}${label}`} type="number" min="0" step="any" value={row[field]} onChange={e => edit(field, e.target.value)} /> : <strong>{row[field].toLocaleString('zh-CN', { maximumFractionDigits: 6 })}</strong>}</label>)}</div>
    <div className="stock-bottom"><span>股息率 <b>{percent(dividendYield(row))}</b></span><span>年分红 <b>¥{money(annual(row))}</b></span></div>
    {editable && <div className={`save-state ${status === '保存失败' ? 'failed' : ''}`} role="status">{status}{status === '保存失败' && <button onClick={() => { if (pending.current) save(pending.current); }}>重试保存</button>}</div>}
  </article>;
}

export default function App() {
  const [rows, setRows] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState('');
  const [loggedIn, setLoggedIn] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [token, setToken] = useState('');
  const [sent, setSent] = useState(false);
  const [authMessage, setAuthMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);
  const [saveStates, setSaveStates] = useState<Record<string, SaveState>>({});
  const editSession = useRef(0);
  const editable = canEdit(loggedIn, admin);
  const unsaved = Object.values(saveStates).some(s => s !== '已保存');
  const summary = totals(rows);
  const payouts = monthlyPayouts(rows);
  const payoutsUnavailable = loading || !supabase || (Boolean(error) && rows.length === 0);
  const refresh = useRef<() => void>(() => {});
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    let version = 0;
    let currentUserId: string | null | undefined;
    async function checkAuth(userId: string | null, force = false) {
      if (!active || (!force && currentUserId === userId)) return;
      currentUserId = userId;
      const current = ++version;
      const hasSession = userId !== null;
      editSession.current += 1;
      setLoggedIn(hasSession); setAdmin(false); setAuthChecked(false);
      setSaveStates({}); setAdding(false); setLoading(true); setError('');
      try {
        let isAdmin = false;
        if (hasSession) {
          const result = await supabase!.rpc('is_admin');
          if (!active || current !== version) return;
          isAdmin = !result.error && result.data === true;
          if (result.error) setAuthMessage('编辑权限检查失败，请重新登录。');
        }
        const holdings = await loadHoldings();
        if (!active || current !== version) return;
        setRows(holdings); setAdmin(isAdmin);
      } catch {
        if (active && current === version) setError('数据加载失败，请检查网络、Supabase 配置及数据库迁移。');
      } finally {
        if (active && current === version) { setLoading(false); setAuthChecked(true); }
      }
    }
    refresh.current = () => { void checkAuth(currentUserId ?? null, true); };
    void supabase.auth.getSession().then(({ data, error }) => { if (error) setAuthMessage('登录状态读取失败。'); void checkAuth(data.session?.user.id ?? null); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => { setTimeout(() => { if (active) void checkAuth(session?.user.id ?? null); }, 0); });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  useEffect(() => {
    const guard = (e: BeforeUnloadEvent) => { if (unsaved) e.preventDefault(); };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [unsaved]);
  async function authenticate(verify: boolean) {
    if (!supabase) return;
    if (verify && !/^\d{6}$/.test(token)) return;
    setBusy(true); setAuthMessage('');
    try {
      const result = verify ? await supabase.auth.verifyOtp({ email, token, type: 'email' }) : await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false, emailRedirectTo: window.location.origin + window.location.pathname } });
      if (result.error) throw result.error;
      if (verify) { setLoginOpen(false); setToken(''); setAuthMessage('登录成功'); }
      else { setSent(true); setAuthMessage('登录邮件已发送，请打开邮箱并点击邮件中的登录链接，返回本页后将自动登录。'); }
    } catch { setAuthMessage(verify ? '验证码无效或已过期，请重试。' : '发送失败，请检查邮箱、网络或联系管理员。'); }
    finally { setBusy(false); }
  }
  async function remove(row: Holding) {
    if (!editable || !confirm(`确定删除「${row.name}」吗？此操作不可撤销。`)) return;
    setBusy(true);
    const result = await supabase!.from('holdings').delete().eq('id', row.id).select('id').single();
    if (result.error) setError('删除失败，请重试。');
    else { setRows(current => current.filter(h => h.id !== row.id)); setSaveStates(current => { const next = { ...current }; delete next[row.id]; return next; }); }
    setBusy(false);
  }
  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!editable) return;
    const form = new FormData(e.currentTarget);
    const item = { code: String(form.get('code')).trim(), name: String(form.get('name')).trim(), shares: Number(form.get('shares')), price: Number(form.get('price')), dps: Number(form.get('dps')), sort: Math.max(-1, ...rows.map(h => h.sort)) + 1 };
    if (!item.code || !item.name || [item.shares, item.price, item.dps].some(n => !Number.isFinite(n) || n < 0)) { setError('请填写有效的名称、代码和非负数值。'); return; }
    setBusy(true);
    const result = await supabase!.from('holdings').insert(item).select().single();
    if (result.error) setError('添加失败，请检查输入并重试。');
    else { setRows(current => [...current, result.data as Holding]); setAdding(false); }
    setBusy(false);
  }
  return <><header><div className="header-inner"><a className="brand" href="#">攒股<span>收息</span><small>分红计算器</small></a><span className="pill">模拟盘记录</span></div></header><main>
    <div className="intro"><div><p className="eyebrow">让每一份持有，都看得见回报</p><h1>慢慢攒股，安心收息。</h1><p>主账户 · {editable ? '管理员编辑模式' : '公开只读模式'}</p></div>{supabase && (loggedIn ? <button disabled={busy || unsaved} onClick={async () => { setBusy(true); const result = await supabase!.auth.signOut(); if (result.error) setAuthMessage('退出失败，请重试。'); setBusy(false); }}>退出登录</button> : <button onClick={() => setLoginOpen(!loginOpen)}>管理员登录</button>)}</div>
    {!supabase && <div className="alert" role="alert"><b>未配置 Supabase</b><p>请设置 VITE_SUPABASE_URL 和 VITE_SUPABASE_ANON_KEY 后重新构建。不会使用本地数据替代云端数据。</p></div>}
    {loggedIn && authChecked && !admin && <div className="notice">该账号无编辑权限</div>}
    {authMessage && <p role="status" className="notice">{authMessage}</p>}
    {loginOpen && !loggedIn && <form className="panel login" onSubmit={e => { e.preventDefault(); void authenticate(sent); }}>
      <h2>管理员登录</h2>
      <label>邮箱<input type="email" required value={email} disabled={sent} onChange={e => setEmail(e.target.value)} autoComplete="email" /></label>
      {!sent && <button className="primary" disabled={busy}>{busy ? '发送中…' : '发送登录邮件'}</button>}
      {sent && <>
        <p className="section-note">请点击邮件中的登录链接。邮件没有验证码时，无需输入验证码。</p>
        <details><summary>邮件中有六位验证码？（可选）</summary>
          <label>六位验证码<input pattern="[0-9]{6}" maxLength={6} inputMode="numeric" autoComplete="one-time-code" value={token} onChange={e => setToken(e.target.value)} /></label>
          <button className="primary" disabled={busy || !/^\d{6}$/.test(token)}>{busy ? '处理中…' : '使用验证码登录'}</button>
        </details>
        <button type="button" onClick={() => { setSent(false); setToken(''); }}>更换邮箱 / 重新发送</button>
      </>}
    </form>}
    {error && <div className="alert" role="alert">{error}{!unsaved && <button onClick={() => refresh.current()}>重新加载</button>}</div>}
    <section className="summary" aria-label="持仓概览">{[['总市值', `¥${money(summary.value)}`], ['年分红合计', `¥${money(summary.income)}`], ['组合股息率', percent(summary.yield)], ['月均分红', `¥${money(summary.monthly)}`]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{loading || !supabase || (error && rows.length === 0) ? '—' : value}</strong></div>)}</section>
    <section><div className="section-title"><h2>我的持仓 <small>{rows.length} 只股票</small></h2>{editable && <button className="primary" disabled={busy} onClick={() => setAdding(!adding)}>{adding ? '取消添加' : '＋ 添加股票'}</button>}</div><p className="section-note">{editable ? '修改数值后约 600 毫秒自动保存；所有访客可查看。' : '所有人可查看，仅管理员登录后可修改。'}</p>
      {editable && adding && <form className="panel add-form" onSubmit={add}><h3>添加股票</h3>{[['code', '股票代码'], ['name', '股票名称'], ['shares', '股数'], ['price', '价格（元）'], ['dps', '每股分红（元）']].map(([name, label], i) => <label key={name}>{label}<input name={name} required type={i < 2 ? 'text' : 'number'} min={i < 2 ? undefined : '0'} step="any" /></label>)}<button className="primary" disabled={busy}>{busy ? '添加中…' : '确认添加'}</button></form>}
      {loading && <div className="panel">正在加载持仓…</div>}{!loading && supabase && !error && rows.length === 0 && <div className="panel">暂无持仓{editable ? '，点击「添加股票」开始记录。' : '，等待管理员添加。'}</div>}
      <div className="stock-grid">{rows.map(row => <StockCard key={`${editSession.current}:${row.id}`} row={row} editable={editable} authSession={editSession} onChange={next => setRows(current => current.map(h => h.id === next.id ? next : h))} onDelete={() => { if (!busy) void remove(row); }} onStatus={(id, state) => setSaveStates(current => ({ ...current, [id]: state }))} />)}</div>
    </section>
    <section className="panel calendar"><div className="section-title"><h2>按月到账表</h2><span className="pill">持仓测算 / 预估</span></div><p className="section-note">2026年12月 — 2027年11月 · 按当前股数、每股分红及默认到账比例测算</p>{payouts.unscheduled.length > 0 && <p className="section-note">{payouts.unscheduled.map(h => `${h.name}（${h.code}）`).join('、')}：未配置到账月份，不计入按月表</p>}<div className="month-table">{payouts.months.map(m => <div className={`month-row ${m.special ? 'special' : ''}`} key={m.month}><time>{m.month}</time><div><b>{payoutsUnavailable ? '—' : m.amount ? `约 ¥${money(m.amount)}` : '¥0.00'}</b>{!payoutsUnavailable && m.note && <small>{m.note}</small>}{m.special && <em>不计入合计</em>}</div></div>)}</div><div className="calendar-total"><span>到账合计（不含特别分红）</span><strong>{payoutsUnavailable ? '—' : `约 ¥${money(payouts.total)}`}</strong></div></section>
    <section className="panel methodology"><p className="eyebrow">不同口径，分开看</p><h2>合计口径</h2><dl><div><dt>默认持仓 · 按2025每股分红简单乘</dt><dd>年分红约 ¥22,780</dd></div><div><dt>当前持仓按每股分红计算</dt><dd>{loading || !supabase || (error && rows.length === 0) ? '—' : `¥${money(summary.income)}`}</dd></div><div><dt>按月到账合计（不含白药特别分红）</dt><dd>{payoutsUnavailable ? '—' : `约 ¥${money(payouts.total)}`}</dd></div><div><dt>含特别分红</dt><dd>{payoutsUnavailable ? '—' : `约 ¥${money(payouts.includingSpecial)}`}</dd></div></dl><p className="section-note">白药特别分红默认不计入合计，单独一行显示。每股分红年度口径与到账时间口径不同，不强行对齐。</p></section>
  </main><footer><strong>攒股收息 · 与时间做朋友</strong><p>{disclaimer}</p></footer></>;
}

export interface Payout { month: number; dps: number; note?: string; special?: boolean }
export interface Holding { id: string; code: string; name: string; shares: number; price: number; dps: number; dps_note: string | null; sort: number; payouts: Payout[] }
export function isPayout(value: unknown): value is Payout {
  if (!value || typeof value !== 'object') return false;
  const entry = value as Record<string, unknown>;
  return typeof entry.month === 'number' && Number.isInteger(entry.month) && entry.month >= 1 && entry.month <= 12
    && typeof entry.dps === 'number' && Number.isFinite(entry.dps) && entry.dps >= 0
    && (entry.note === undefined || typeof entry.note === 'string')
    && (entry.special === undefined || typeof entry.special === 'boolean');
}
export const normalizePayouts = (value: unknown): Payout[] => Array.isArray(value) ? value.filter(isPayout) : [];
export const defaults = [
  { code: '601318', name: '平安', shares: 5000, price: 55.46, dps: 2.70, dps_note: '2025年度 · 价格为2026-11-20收盘', payouts: [{ month: 6, dps: 1.75, note: '平安末期' }, { month: 10, dps: 0.95, note: '平安中期' }] },
  { code: '601166', name: '兴业', shares: 3000, price: 20.30, dps: 1.066, dps_note: '2025年度', payouts: [{ month: 2, dps: 0.565, note: '兴业中期估' }, { month: 6, dps: 0.501, note: '兴业末期' }] },
  { code: '600690', name: '海尔', shares: 3000, price: 23.02, dps: 1.16, dps_note: '2025年度', payouts: [{ month: 8, dps: 0.891667, note: '海尔末期' }] },
  { code: '000538', name: '白药', shares: 1000, price: 56.40, dps: 2.602, dps_note: 'TTM（滚动十二个月）', payouts: [{ month: 4, dps: 1.583, note: '白药年度估' }, { month: 9, dps: 1.038, note: '白药特别分红，不确定', special: true }] },
];
type Position = Pick<Holding, 'shares' | 'price' | 'dps'>;
export const annual = (h: Position) => h.shares * h.dps;
export const dividendYield = (h: Position) => h.price > 0 ? h.dps / h.price : 0;
export function totals(rows: Position[]) {
  const value = rows.reduce((sum, h) => sum + h.shares * h.price, 0);
  const income = rows.reduce((sum, h) => sum + annual(h), 0);
  return { value, income, yield: value > 0 ? income / value : 0, monthly: income / 12 };
}
const payoutMonths = ['2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06', '2027-07', '2027-08', '2027-09', '2027-10', '2027-11'];
const cents = (amount: number) => {
  const scaled = amount * 100;
  return Math.round(scaled + Number.EPSILON * Math.max(1, Math.abs(scaled)) * 4) / 100;
};
export function monthlyPayouts(rows: (Pick<Holding, 'code' | 'name' | 'shares'> & { payouts?: Payout[] | null })[]) {
  const entries = rows.flatMap(h => normalizePayouts(h.payouts).map(p => ({
    ...p, amount: cents(h.shares * p.dps), note: p.note || h.name,
    month: p.month === 12 ? '2026-12' : `2027-${String(p.month).padStart(2, '0')}`,
  })));
  const months = payoutMonths.flatMap(month => {
    const regular = entries.filter(e => e.month === month && !e.special);
    const special = entries.filter(e => e.month === month && e.special);
    const normalRows = regular.length || !special.length ? [{
      month, amount: cents(regular.reduce((sum, e) => sum + e.amount, 0)),
      note: regular.map(e => `${e.note}${regular.length > 1 ? e.amount : ''}`).join(' + '), special: false,
    }] : [];
    return [...normalRows, ...special.map(e => ({ month, amount: e.amount, note: e.note, special: true }))];
  });
  const total = cents(months.reduce((sum, m) => sum + (m.special ? 0 : m.amount), 0));
  const special = cents(months.reduce((sum, m) => sum + (m.special ? m.amount : 0), 0));
  const unscheduled = rows.filter(h => normalizePayouts(h.payouts).length === 0);
  return { months, total, special, includingSpecial: cents(total + special), unscheduled };
}

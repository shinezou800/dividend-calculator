export interface Holding { id: string; code: string; name: string; shares: number; price: number; dps: number; dps_note: string | null; sort: number }
export const defaults = [
  { code: '601318', name: '平安', shares: 5000, price: 55.46, dps: 2.70, dps_note: '2025年度 · 价格为2026-11-20收盘' },
  { code: '601166', name: '兴业', shares: 3000, price: 20.30, dps: 1.066, dps_note: '2025年度' },
  { code: '600690', name: '海尔', shares: 3000, price: 23.02, dps: 1.16, dps_note: '2025年度' },
  { code: '000538', name: '白药', shares: 1000, price: 56.40, dps: 2.602, dps_note: 'TTM（滚动十二个月）' },
];
type Position = Pick<Holding, 'shares' | 'price' | 'dps'>;
export const annual = (h: Position) => h.shares * h.dps;
export const dividendYield = (h: Position) => h.price > 0 ? h.dps / h.price : 0;
export function totals(rows: Position[]) {
  const value = rows.reduce((sum, h) => sum + h.shares * h.price, 0);
  const income = rows.reduce((sum, h) => sum + annual(h), 0);
  return { value, income, yield: value > 0 ? income / value : 0, monthly: income / 12 };
}
const payoutSchedule = [
  { code: '601318', month: '2027-06', numerator: 8750, denominator: 13500, note: '平安末期', showAmount: true },
  { code: '601318', month: '2027-10', numerator: 4750, denominator: 13500, note: '平安中期' },
  { code: '601166', month: '2027-02', numerator: 1695, denominator: 3198, note: '兴业中期估' },
  { code: '601166', month: '2027-06', numerator: 1503, denominator: 3198, note: '兴业末期', showAmount: true },
  { code: '600690', month: '2027-08', numerator: 2675, denominator: 3480, note: '海尔末期' },
  { code: '000538', month: '2027-04', numerator: 1583, denominator: 2602, note: '白药年度估' },
  { code: '000538', month: '2027-09', numerator: 1038, denominator: 2602, note: '白药特别分红，不确定', special: true },
];
const payoutMonths = ['2026-12', '2027-01', '2027-02', '2027-03', '2027-04', '2027-05', '2027-06', '2027-07', '2027-08', '2027-09', '2027-10', '2027-11'];
const cents = (amount: number) => Math.round(amount * 100) / 100;
export function monthlyPayouts(rows: Pick<Holding, 'code' | 'name' | 'shares' | 'dps'>[]) {
  const months = payoutMonths.map(month => {
    const entries = payoutSchedule.filter(s => s.month === month).map(s => {
      const income = rows.filter(h => h.code === s.code).reduce((sum, h) => sum + h.shares * h.dps, 0);
      return { ...s, amount: cents(income * s.numerator / s.denominator) };
    });
    return {
      month,
      amount: cents(entries.reduce((sum, e) => sum + e.amount, 0)),
      note: entries.map(e => `${e.note}${e.showAmount ? e.amount : ''}`).join(' + '),
      special: entries.some(e => e.special),
    };
  });
  const total = cents(months.reduce((sum, m) => sum + (m.special ? 0 : m.amount), 0));
  const special = cents(months.reduce((sum, m) => sum + (m.special ? m.amount : 0), 0));
  const unscheduled = rows.filter(h => !payoutSchedule.some(s => s.code === h.code));
  return { months, total, special, includingSpecial: cents(total + special), unscheduled };
}

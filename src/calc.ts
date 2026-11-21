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
export const months = [
  { month: '2026-12', amount: 0 }, { month: '2027-01', amount: 0 },
  { month: '2027-02', amount: 1695, note: '兴业中期估' }, { month: '2027-03', amount: 0 },
  { month: '2027-04', amount: 1583, note: '白药年度估' }, { month: '2027-05', amount: 0 },
  { month: '2027-06', amount: 10253, note: '平安末期8750 + 兴业末期1503' }, { month: '2027-07', amount: 0 },
  { month: '2027-08', amount: 2675, note: '海尔末期' },
  { month: '2027-09', amount: 1038, note: '白药特别分红，不确定', special: true },
  { month: '2027-10', amount: 4750, note: '平安中期' }, { month: '2027-11', amount: 0 },
];
export const monthTotal = (includeSpecial = false) => months.reduce((sum, m) => sum + (!m.special || includeSpecial ? m.amount : 0), 0);

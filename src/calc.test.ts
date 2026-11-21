import { describe, expect, it } from 'vitest';
import { annual, defaults, dividendYield, months, monthTotal, totals } from './calc';
import { canEdit } from './db';
describe('分红计算', () => {
  it('平安股息率和年分红', () => {
    expect((dividendYield(defaults[0]) * 100).toFixed(2)).toBe('4.87');
    expect(annual(defaults[0])).toBe(13500);
  });
  it.each([[1, 3198], [2, 3480], [3, 2602]])('默认持仓 %i 年分红', (index, expected) => {
    expect(annual(defaults[index])).toBeCloseTo(expected, 8);
  });
  it('默认持仓合计', () => {
    expect(totals(defaults).income).toBe(22780);
    expect(totals(defaults).monthly).toBeCloseTo(22780 / 12);
    expect(totals(defaults).value).toBe(463660);
    expect(totals(defaults).yield).toBeCloseTo(22780 / 463660);
  });
  it('空持仓与零价格不产生无穷值', () => {
    expect(totals([])).toEqual({ value: 0, income: 0, monthly: 0, yield: 0 });
    expect(dividendYield({ shares: 1, price: 0, dps: 1 })).toBe(0);
  });
  it('按月固定数据合计，特别分红单列且不随持仓改变', () => {
    expect(months).toHaveLength(12);
    expect(monthTotal()).toBe(20956);
    expect(monthTotal(true)).toBe(21994);
    expect(months.filter(m => m.special).map(m => m.amount)).toEqual([1038]);
    totals([]);
    expect(monthTotal()).toBe(20956);
  });
});
describe('编辑权限默认拒绝', () => {
  it.each([[false, false, false], [false, true, false], [true, false, false], [true, true, true]])('登录=%s 管理员=%s 编辑=%s', (loggedIn, admin, expected) => {
    expect(canEdit(loggedIn, admin)).toBe(expected);
  });
});

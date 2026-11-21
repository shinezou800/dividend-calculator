import { describe, expect, it } from 'vitest';
import { annual, defaults, dividendYield, monthlyPayouts, totals } from './calc';
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
});
describe('按持仓测算到账月份', () => {
  it('默认各月金额及特别分红与原表完全一致', () => {
    const result = monthlyPayouts(defaults);
    expect(result.months.map(m => [m.month, m.amount])).toEqual([
      ['2026-12', 0], ['2027-01', 0], ['2027-02', 1695], ['2027-03', 0],
      ['2027-04', 1583], ['2027-05', 0], ['2027-06', 10253], ['2027-07', 0],
      ['2027-08', 2675], ['2027-09', 1038], ['2027-10', 4750], ['2027-11', 0],
    ]);
    expect(result.total).toBe(20956);
    expect(result.includingSpecial).toBe(21994);
    expect(result.special).toBe(1038);
    expect(result.months.filter(m => m.special).map(m => m.amount)).toEqual([1038]);
    expect(result.months[6].note).toBe('平安末期8750 + 兴业末期1503');
    expect(result.months[2].note).toBe('兴业中期估');
    expect(result.months[4].note).toBe('白药年度估');
    expect(result.months[9].note).toBe('白药特别分红，不确定');
    expect(result.unscheduled).toEqual([]);
  });
  it('平安增加股数按原比例同步改变六月、十月及合计', () => {
    const result = monthlyPayouts(defaults.map(h => h.code === '601318' ? { ...h, shares: 6000 } : h));
    expect(result.months[6].amount).toBe(12003);
    expect(result.months[6].note).toBe('平安末期10500 + 兴业末期1503');
    expect(result.months[10].amount).toBe(5700);
    expect(result.total).toBe(23656);
    expect(result.includingSpecial).toBe(24694);
    expect(result.special).toBe(1038);
  });
  it('每股分红改变同时缩放普通及特别分红，不受价格影响', () => {
    const result = monthlyPayouts(defaults.map(h => h.code === '000538' ? { ...h, dps: 5.204, price: 1 } : h));
    expect(result.months[4].amount).toBe(3166);
    expect(result.months[9].amount).toBe(2076);
    expect(result.total).toBe(22539);
    expect(result.includingSpecial).toBe(24615);
    expect(result.special).toBe(2076);
  });
  it('删除白药后不再计入到账金额，特别分红行仍保留', () => {
    const result = monthlyPayouts(defaults.filter(h => h.code !== '000538'));
    expect(result.months[4].amount).toBe(0);
    expect(result.months[9]).toMatchObject({ amount: 0, special: true });
    expect(result.total).toBe(19373);
    expect(result.includingSpecial).toBe(19373);
    expect(result.special).toBe(0);
  });
  it('新增无配置股票不虚构月份，但仍参与简单年分红合计', () => {
    const extra = { code: '123456', name: '新股票', shares: 100, dps: 2, price: 10 };
    const result = monthlyPayouts([...defaults, extra]);
    expect(result.months).toEqual(monthlyPayouts(defaults).months);
    expect(result.unscheduled).toEqual([extra]);
    expect(totals([...defaults, extra]).income).toBe(22980);
  });
  it('空持仓或零股数、零分红时各月及合计为零', () => {
    for (const rows of [[], defaults.map(h => ({ ...h, shares: 0 })), defaults.map(h => ({ ...h, dps: 0 }))]) {
      const result = monthlyPayouts(rows);
      expect(result.months).toHaveLength(12);
      expect(result.months.every(m => m.amount === 0)).toBe(true);
      expect([result.total, result.includingSpecial, result.special]).toEqual([0, 0, 0]);
    }
  });
  it('同代码持仓合并并按分取整，备注金额与月表一致', () => {
    const result = monthlyPayouts([{ ...defaults[0], shares: 1 }, { ...defaults[0], shares: 1 }]);
    expect(result.months[6].amount).toBe(3.5);
    expect(result.months[10].amount).toBe(1.9);
    expect(result.total).toBe(5.4);
    expect(result.months[6].note).toBe('平安末期3.5 + 兴业末期0');
  });
});
describe('编辑权限默认拒绝', () => {
  it.each([[false, false, false], [false, true, false], [true, false, false], [true, true, true]])('登录=%s 管理员=%s 编辑=%s', (loggedIn, admin, expected) => {
    expect(canEdit(loggedIn, admin)).toBe(expected);
  });
});

import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { containsServerKey } from './check-dist.mjs';

const jwt = payload => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.ZmFrZS1zaWduYXR1cmU`;
const directories = [];
afterEach(() => directories.splice(0).forEach(path => rmSync(path, { recursive: true, force: true })));

describe('构建产物密钥检测', () => {
  it.each(['', 'service_role', 'sb_secret_', 'sb_secret_short', 'sb_publishable_public-key', jwt({ role: 'anon' }), jwt({ role: 'authenticated' }), 'eyJinvalid.eyJinvalid.signature'])('允许公开配置、SDK字面量和非服务端JWT：%s', text => {
    expect(containsServerKey(text)).toBe(false);
  });
  it.each([`sb_secret_${'x'.repeat(20)}`, 'sb_secret_ABCdef0123456789_-xyz', jwt({ role: 'service_role' }), `${jwt({ role: 'anon' })} ${jwt({ role: 'service_role' })}`])('识别服务端密钥：%s', text => {
    expect(containsServerKey(text)).toBe(true);
  });
  it('JWT需要解码并匹配准确的role字段', () => {
    expect(containsServerKey(jwt({ note: 'service_role', role: 'anon' }))).toBe(false);
    expect(containsServerKey(jwt({ role: 'service_role_extra' }))).toBe(false);
    expect(containsServerKey(`eyJhbGciOiJIUzI1NiJ9.${Buffer.from('{"role" : "service_role" }').toString('base64url')}.signature`)).toBe(true);
  });
  it('命令行扫描嵌套及隐藏文件；泄漏时失败且不打印内容', () => {
    const root = mkdtempSync(join(tmpdir(), 'dist-guard-')); directories.push(root);
    mkdirSync(join(root, 'assets'));
    const run = path => spawnSync(process.execPath, [fileURLToPath(new URL('./check-dist.mjs', import.meta.url)), path], { encoding: 'utf8' });
    expect(run(root).status).toBe(1);
    writeFileSync(join(root, 'assets', '.bundle.js'), 'sb_secret_ service_role');
    expect(run(root).status).toBe(0);
    for (const leaked of [jwt({ role: 'service_role' }), `sb_secret_${'x'.repeat(24)}`]) {
      writeFileSync(join(root, 'assets', '.bundle.js'), leaked);
      const result = run(root);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('检查失败');
      expect(result.stderr).not.toContain(leaked);
    }
    expect(run(join(root, 'missing')).status).toBe(1);
  });
});

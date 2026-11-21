import { readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function containsServerKey(text) {
  if (/sb_secret_[A-Za-z0-9_-]{20,}/.test(text)) return true;
  for (const match of text.matchAll(/eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/g)) {
    try {
      const payload = JSON.parse(Buffer.from(match[0].split('.')[1], 'base64url').toString('utf8'));
      if (payload.role === 'service_role') return true;
    } catch {}
  }
  return false;
}

export function checkDist(directory) {
  let files = 0;
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files += checkDist(path);
    else if (entry.isFile()) {
      if (containsServerKey(readFileSync(path, 'utf8'))) throw new Error('检测到服务端密钥，停止发布。');
      files += 1;
    } else throw new Error('构建产物包含不支持的文件类型，停止发布。');
  }
  return files;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const files = checkDist(process.argv[2] || 'dist');
    if (!files) throw new Error('构建产物为空。');
    console.log(`构建产物密钥检查通过（${files} 个文件）。`);
  } catch {
    console.error('构建产物密钥检查失败：发现服务端密钥或无法完整扫描，停止发布。');
    process.exitCode = 1;
  }
}

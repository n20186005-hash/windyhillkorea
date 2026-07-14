import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, stat, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const GALLERY_DIR = join(__dirname, '..', 'public', 'gallery');

// sharp 未写入 package.json（避免改动 package-lock.json 导致 npm ci 失败），
// 这里在运行时按需安装到 node_modules（--no-save）。
async function loadSharp() {
  try {
    return (await import('sharp')).default;
  } catch {
    console.log('[optimize] 未检测到 sharp，正在安装（--no-save）...');
    await execFileAsync(
      'npm',
      ['install', 'sharp', '--no-save', '--no-audit', '--no-fund'],
      { stdio: 'inherit' }
    );
    return (await import('sharp')).default;
  }
}

// Cloudflare Pages 限制单个静态资源最大 25 MiB，这里留安全余量。
const MAX_BYTES = 22 * 1024 * 1024;
const MIN_QUALITY = 50;

async function getImageFiles(dir) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const files = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      files.push(...(await getImageFiles(full)));
    } else if (/\.(jpe?g|png|webp)$/i.test(e.name)) {
      files.push(full);
    }
  }
  return files;
}

async function optimizeFile(file, sharp) {
  const { size } = await stat(file);
  if (size <= MAX_BYTES) return;

  console.log(
    `[optimize] ${file} 当前 ${(size / 1024 / 1024).toFixed(2)} MiB，超过限制，开始压缩...`
  );

  const meta = await sharp(file).metadata();
  const longest = Math.max(meta.width || 0, meta.height || 0);
  let quality = 82;
  let maxDim = Math.min(longest || 4000, 2600);
  let ok = false;

  while (quality >= MIN_QUALITY && !ok) {
    const buf = await sharp(file)
      .resize({ width: maxDim, height: maxDim, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();

    if (buf.length <= MAX_BYTES) {
      await writeFile(file, buf);
      console.log(
        `[optimize] -> ${(buf.length / 1024 / 1024).toFixed(2)} MiB（quality ${quality}, 最长边 ${maxDim}px）`
      );
      ok = true;
    } else if (quality > MIN_QUALITY) {
      quality -= 6;
    } else {
      maxDim = Math.round(maxDim * 0.85);
    }
  }

  if (!ok) {
    console.warn(`[optimize] 警告：${file} 无法压缩到限制以下，请手动处理。`);
  }
}

const sharp = await loadSharp();
const files = await getImageFiles(GALLERY_DIR);
await Promise.all(files.map((f) => optimizeFile(f, sharp)));
console.log('[optimize] 图片优化完成。');

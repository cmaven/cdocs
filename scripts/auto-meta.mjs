/**
 * auto-meta.mjs: MDX 문서 디렉토리의 meta.json 및 frontmatter 자동 생성
 * 상세: content/docs/ 스캔 후 누락된 meta.json과 frontmatter를 자동 생성
 * 생성일: 2026-04-08
 */

import { readdir, readFile, writeFile, stat } from 'fs/promises';
import { join, basename, relative } from 'path';

const CONTENT_DIR = 'content/docs';
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isForce = args.includes('--force');

const stats = { metaCreated: 0, metaSkipped: 0, frontmatterAdded: 0, frontmatterSkipped: 0 };

function toTitle(name) {
  return name
    .replace(/^\d+[-_]/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

async function getSubdirs(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter(e => e.isDirectory() && !e.name.startsWith('.')).map(e => e.name);
}

async function getMdxFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries.filter(e => e.isFile() && (e.name.endsWith('.mdx') || e.name.endsWith('.md'))).map(e => e.name);
}

async function ensureFrontmatter(filePath) {
  const content = await readFile(filePath, 'utf-8');
  if (content.startsWith('---')) {
    stats.frontmatterSkipped++;
    return;
  }

  const ext = filePath.endsWith('.mdx') ? '.mdx' : '.md';
  const name = basename(filePath, ext);
  const title = name === 'index' ? toTitle(basename(join(filePath, '..'))) + ' 개요' : toTitle(name);
  const frontmatter = `---\ntitle: ${title}\ndescription: "${title}"\n---\n\n`;
  const newContent = frontmatter + content;

  console.log(`  + frontmatter: ${relative('.', filePath)}`);
  if (!isDryRun) {
    await writeFile(filePath, newContent, 'utf-8');
  }
  stats.frontmatterAdded++;
}

async function processDir(dir, isRoot = false) {
  const mdxFiles = await getMdxFiles(dir);
  const subdirs = await getSubdirs(dir);
  const metaPath = join(dir, 'meta.json');
  const hasExistingMeta = await stat(metaPath).then(() => true).catch(() => false);

  // frontmatter 확인
  for (const f of mdxFiles) {
    await ensureFrontmatter(join(dir, f));
  }

  // meta.json 생성 또는 업데이트
  if (mdxFiles.length > 0 || subdirs.length > 0) {
    const mdxNames = mdxFiles.map(f => f.replace(/\.(mdx|md)$/, ''));
    const allEntries = [...mdxNames.filter(n => n !== 'index'), ...subdirs.filter(d => d !== 'assets')];

    if (hasExistingMeta && !isForce) {
      // 기존 meta.json에 누락된 파일/폴더 자동 추가
      const existingMeta = JSON.parse(await readFile(metaPath, 'utf-8'));
      const existingPages = new Set(existingMeta.pages || []);
      let updated = false;

      // index 파일이 있는데 pages에 없으면 맨 앞에 추가
      if (mdxNames.includes('index') && !existingPages.has('index')) {
        existingMeta.pages.unshift('index');
        updated = true;
      }

      for (const entry of allEntries) {
        if (!existingPages.has(entry)) {
          existingMeta.pages.push(entry);
          console.log(`  + meta.json 항목 추가: ${relative('.', metaPath)} → ${entry}`);
          updated = true;
        }
      }

      if (updated && !isDryRun) {
        await writeFile(metaPath, JSON.stringify(existingMeta, null, 2) + '\n', 'utf-8');
        stats.metaCreated++;
      } else {
        stats.metaSkipped++;
      }
    } else {
      const pages = [];
      if (mdxNames.includes('index')) {
        pages.push('index');
      }
      allEntries.filter(n => n !== 'index').sort().forEach(n => {
        if (!pages.includes(n)) pages.push(n);
      });

      const dirName = basename(dir);
      const meta = { title: toTitle(dirName), pages };
      if (isRoot) {
        meta.root = true;
        meta.defaultOpen = true;
      }

      const label = hasExistingMeta ? '덮어쓰기' : '생성';
      console.log(`  + meta.json ${label}: ${relative('.', metaPath)}`);
      if (!isDryRun) {
        await writeFile(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf-8');
      }
      stats.metaCreated++;
    }
  }

  // 재귀 탐색
  for (const sub of subdirs) {
    await processDir(join(dir, sub), false);
  }
}

async function updateRootMeta() {
  const rootMetaPath = join(CONTENT_DIR, 'meta.json');
  const rootMeta = JSON.parse(await readFile(rootMetaPath, 'utf-8'));
  const subdirs = await getSubdirs(CONTENT_DIR);
  const mdxFiles = await getMdxFiles(CONTENT_DIR);
  const mdxNames = mdxFiles.map(f => f.replace(/\.(mdx|md)$/, ''));

  const allEntries = new Set([...rootMeta.pages]);
  for (const name of [...mdxNames, ...subdirs]) {
    if (!allEntries.has(name)) {
      allEntries.add(name);
      console.log(`  + 최상위 meta.json에 추가: ${name}`);
    }
  }

  const newPages = [...allEntries];
  if (JSON.stringify(newPages) !== JSON.stringify(rootMeta.pages)) {
    rootMeta.pages = newPages;
    if (!isDryRun) {
      await writeFile(rootMetaPath, JSON.stringify(rootMeta, null, 2) + '\n', 'utf-8');
    }
  }
}

async function main() {
  console.log(`\n📄 auto-meta: content/docs/ 스캔 중...`);
  if (isDryRun) console.log('   (dry-run 모드 — 실제 변경 없음)\n');
  if (isForce) console.log('   (force 모드 — 기존 meta.json 덮어쓰기)\n');

  const rootDirs = await getSubdirs(CONTENT_DIR);

  // 루트 레벨 MDX frontmatter 확인
  const rootMdx = await getMdxFiles(CONTENT_DIR);
  for (const f of rootMdx) {
    await ensureFrontmatter(join(CONTENT_DIR, f));
  }

  // 각 카테고리 처리
  for (const dir of rootDirs) {
    await processDir(join(CONTENT_DIR, dir), true);
  }

  // 최상위 meta.json 동기화
  await updateRootMeta();

  console.log(`\n✅ 완료`);
  console.log(`   meta.json 생성: ${stats.metaCreated}, 스킵: ${stats.metaSkipped}`);
  console.log(`   frontmatter 추가: ${stats.frontmatterAdded}, 스킵: ${stats.frontmatterSkipped}\n`);
}

const isWatch = args.includes('--watch');

async function watch() {
  const { watch: fsWatch } = await import('fs');
  let debounce = null;

  console.log('👀 auto-meta: content/docs/ 감시 중 (파일 변경 시 자동 실행)\n');

  fsWatch(CONTENT_DIR, { recursive: true }, (event, filename) => {
    if (!filename) return;
    // meta.json 변경은 무시 (무한 루프 방지)
    if (filename.endsWith('meta.json')) return;
    if (debounce) clearTimeout(debounce);
    debounce = setTimeout(async () => {
      stats.metaCreated = 0; stats.metaSkipped = 0;
      stats.frontmatterAdded = 0; stats.frontmatterSkipped = 0;
      try { await main(); } catch (e) { console.error('오류:', e.message); }
    }, 1500);
  });
}

if (isWatch) {
  main().then(() => watch()).catch(e => { console.error('오류:', e.message); process.exit(1); });
} else {
  main().catch(e => { console.error('오류:', e.message); process.exit(1); });
}

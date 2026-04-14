/**
 * config.ts: VitePress 사이트 설정 - 자동 사이드바 생성 포함
 * 상세: docs/ 하위에 .md 파일을 배치하면 사이드바에 자동 등록
 * 생성일: 2026-04-08 | 수정일: 2026-04-09
 */
import { defineConfig } from 'vitepress'
import fs from 'node:fs'
import path from 'node:path'
import matter from 'gray-matter'

const docsRoot = path.resolve(__dirname, '..')

/**
 * .md 파일에서 frontmatter title을 읽거나, 파일명을 포맷하여 반환
 */
function getTitle(filePath: string, fileName: string): string {
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    const { data } = matter(content)
    if (data.title) return data.title
  } catch {}
  if (fileName === 'index') return '개요'
  return fileName
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

/**
 * 디렉토리 내 .md 파일을 스캔하여 사이드바 아이템 배열 생성
 * index.md는 "개요"로 맨 앞에 배치
 */
function scanDirectory(dirPath: string, urlPrefix: string): { text: string; link: string }[] {
  if (!fs.existsSync(dirPath)) return []

  const files = fs.readdirSync(dirPath)
    .filter(f => f.endsWith('.md') && !f.startsWith('.'))
    .sort()

  const items: { text: string; link: string }[] = []

  // index.md를 먼저 처리
  if (files.includes('index.md')) {
    const title = getTitle(path.join(dirPath, 'index.md'), 'index')
    items.push({ text: title, link: `${urlPrefix}` })
  }

  // 나머지 파일
  for (const file of files) {
    if (file === 'index.md') continue
    const name = file.replace('.md', '')
    const title = getTitle(path.join(dirPath, file), name)
    items.push({ text: title, link: `${urlPrefix}${name}` })
  }

  return items
}

/**
 * 연도 디렉토리(2020~2026) 내 프로젝트를 자동 스캔하여 사이드바 생성
 */
function generateSidebar(): Record<string, any[]> {
  const sidebar: Record<string, any[]> = {}
  const entries = fs.readdirSync(docsRoot).filter(entry => {
    const fullPath = path.join(docsRoot, entry)
    return fs.statSync(fullPath).isDirectory() && !entry.startsWith('.')
  })

  for (const entry of entries) {
    const entryPath = path.join(docsRoot, entry)

    // guide/ 디렉토리는 특별 처리
    if (entry === 'guide') {
      const items = scanDirectory(entryPath, '/guide/')
      if (items.length > 0) {
        sidebar['/guide/'] = [{ text: '가이드', items }]
      }
      continue
    }

    // public/, .vitepress 등은 건너뛰기
    if (entry === 'public' || entry === '.vitepress') continue

    // 연도 디렉토리 (2020, 2021, ...) 처리
    const isYear = /^\d{4}$/.test(entry)
    if (!isYear) continue

    const yearPath = entryPath
    const projects = fs.readdirSync(yearPath).filter(p => {
      return fs.statSync(path.join(yearPath, p)).isDirectory() && !p.startsWith('.')
    }).sort()

    // 버전 그룹 감지: project-alpha와 project-alpha-v2 등
    const versionGroups = new Map<string, string[]>()
    for (const proj of projects) {
      const baseMatch = proj.match(/^(.+?)(-v\d+)?$/)
      const base = baseMatch ? baseMatch[1] : proj
      if (!versionGroups.has(base)) versionGroups.set(base, [])
      versionGroups.get(base)!.push(proj)
    }

    // 버전이 있는 프로젝트 이름 수집
    const versionedProjects = new Set<string>()
    for (const [base, versions] of versionGroups) {
      if (versions.length > 1) {
        versions.forEach(v => versionedProjects.add(v))
      }
    }

    // 각 프로젝트별 사이드바 생성 (버전 프로젝트는 개별 경로)
    const allProjItems: { proj: string; item: any }[] = []
    for (const proj of projects) {
      const projPath = path.join(yearPath, proj)
      const urlPrefix = `/${entry}/${proj}/`
      const items = scanDirectory(projPath, urlPrefix)
      if (items.length > 0) {
        allProjItems.push({ proj, item: { text: formatName(proj), items, collapsed: true } })
      }
    }

    // 버전 프로젝트: 해당 버전 + 비버전 프로젝트만 표시하는 개별 사이드바
    for (const proj of versionedProjects) {
      const baseMatch = proj.match(/^(.+?)(-v\d+)?$/)
      const base = baseMatch ? baseMatch[1] : proj
      const filteredItems = allProjItems
        .filter(p => {
          if (p.proj === proj) return true  // 현재 버전은 포함
          if (versionedProjects.has(p.proj) && p.proj !== proj) return false  // 다른 버전은 제외
          return true  // 비버전 프로젝트는 포함
        })
        .map(p => ({ ...p.item, collapsed: p.proj !== proj }))

      sidebar[`/${entry}/${proj}/`] = [{ text: entry, items: filteredItems }]
    }

    // 연도 레벨 사이드바 (비버전 프로젝트용 폴백)
    if (allProjItems.length > 0) {
      sidebar[`/${entry}/`] = [{ text: entry, items: allProjItems.map(p => p.item) }]
    }
  }

  return sidebar
}

/**
 * 디렉토리명을 사람이 읽기 좋은 형태로 변환
 * project-alpha → Project Alpha
 */
function formatName(name: string): string {
  return name
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

/**
 * 연도별 카테고리 목록 자동 생성 (CategoryDropdown용)
 * 각 연도의 첫 번째 프로젝트 첫 번째 페이지로 링크
 */
function generateCategories(): { label: string; path: string }[] {
  const categories: { label: string; path: string }[] = []
  const entries = fs.readdirSync(docsRoot)
    .filter(e => /^\d{4}$/.test(e) && fs.statSync(path.join(docsRoot, e)).isDirectory())
    .sort()
    .reverse()

  for (const year of entries) {
    const yearPath = path.join(docsRoot, year)
    const projects = fs.readdirSync(yearPath)
      .filter(p => fs.statSync(path.join(yearPath, p)).isDirectory() && !p.startsWith('.'))
      .sort()
    if (projects.length === 0) continue

    // 첫 번째 프로젝트의 첫 번째 페이지
    const firstProj = projects[0]
    const projPath = path.join(yearPath, firstProj)
    const files = fs.readdirSync(projPath).filter(f => f.endsWith('.md')).sort()
    const firstFile = files.includes('index.md') ? '' : files[0]?.replace('.md', '') || ''
    categories.push({ label: year, path: `/${year}/${firstProj}/${firstFile}` })
  }

  categories.push({ label: '가이드', path: '/guide/' })
  return categories
}

/**
 * 랜딩 페이지 프로젝트 카드 자동 생성 (HomePage용)
 */
function generateHomeProjects(): { year: string; items: { name: string; desc: string; href: string }[] }[] {
  const result: { year: string; items: { name: string; desc: string; href: string }[] }[] = []
  const years = fs.readdirSync(docsRoot)
    .filter(e => /^\d{4}$/.test(e) && fs.statSync(path.join(docsRoot, e)).isDirectory())
    .sort()
    .reverse()

  for (const year of years) {
    const yearPath = path.join(docsRoot, year)
    const projects = fs.readdirSync(yearPath)
      .filter(p => fs.statSync(path.join(yearPath, p)).isDirectory() && !p.startsWith('.'))
      .sort()

    const items: { name: string; desc: string; href: string }[] = []
    for (const proj of projects) {
      const projPath = path.join(yearPath, proj)
      const files = fs.readdirSync(projPath).filter(f => f.endsWith('.md')).sort()
      const firstFile = files.includes('index.md') ? '' : files[0]?.replace('.md', '') || ''
      const indexPath = path.join(projPath, 'index.md')
      let name = formatName(proj)
      let desc = ''
      if (fs.existsSync(indexPath)) {
        try {
          const { data } = matter(fs.readFileSync(indexPath, 'utf-8'))
          if (data.title) name = data.title
          if (data.description) desc = data.description
        } catch {}
      }
      items.push({ name, desc, href: `/${year}/${proj}/${firstFile}` })
    }
    if (items.length > 0) result.push({ year, items })
  }
  return result
}

// 사이드바 + 카테고리 + 홈 프로젝트 자동 생성
const sidebar = generateSidebar()
const categories = generateCategories()
const homeProjects = generateHomeProjects()

export default defineConfig({
  title: 'Tech Docs Portal',
  description: '사내 기술 문서 포털',
  lang: 'ko-KR',

  head: [
    ['link', { rel: 'stylesheet', href: 'https://cdn.jsdelivr.net/gh/sun-typeface/SUITE/fonts/variable/woff2/SUITE-Variable.css' }],
    ['link', { rel: 'stylesheet', href: 'https://cdn.jsdelivr.net/gh/wan2land/d2coding/d2coding-ligature-full.css' }],
  ],

  themeConfig: {
    nav: [],
    sidebar,
    categories,
    homeProjects,

    search: {
      provider: 'local'
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/cmaven' },
      {
        icon: { svg: '<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>' },
        link: '/guide/',
        ariaLabel: 'Guide'
      }
    ],

    outline: {
      level: [2, 3],
      label: '목차'
    },

    darkModeSwitchLabel: '다크 모드',
    returnToTopLabel: '맨 위로',
    sidebarMenuLabel: '메뉴',
  },

  ignoreDeadLinks: true,

  markdown: {
    lineNumbers: true,
    config: (md) => {
      // mermaid 코드블록을 <Mermaid> 컴포넌트로 변환
      const fence = md.renderer.rules.fence!
      md.renderer.rules.fence = (tokens, idx, options, env, self) => {
        const token = tokens[idx]
        if (token.info.trim() === 'mermaid') {
          const chart = token.content
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
          return `<Mermaid chart="${chart}" />\n`
        }
        return fence(tokens, idx, options, env, self)
      }

      // .md 내 <model>, <base> 등 비표준 태그를 자동 이스케이프
      const knownHtml = new Set(['a','abbr','address','area','article','aside','audio','b','base','bdi','bdo','blockquote','body','br','button','canvas','caption','cite','code','col','colgroup','data','datalist','dd','del','details','dfn','dialog','div','dl','dt','em','embed','fieldset','figcaption','figure','footer','form','h1','h2','h3','h4','h5','h6','head','header','hgroup','hr','html','i','iframe','img','input','ins','kbd','label','legend','li','link','main','map','mark','menu','meta','meter','nav','noscript','object','ol','optgroup','option','output','p','param','picture','pre','progress','q','rp','rt','ruby','s','samp','script','search','section','select','slot','small','source','span','strong','style','sub','summary','sup','table','tbody','td','template','textarea','tfoot','th','thead','time','title','tr','track','u','ul','var','video','wbr','svg','path','circle','line','rect','text','g','defs','use','symbol'])
      const knownVue = new Set(['Badge','Button','Callout','Mermaid','Asciinema','Tabs','Tab','Steps','Step','Columns','Column','Details','Hint','Accordion','Accordions','HomePage'])

      const origHtmlInline = md.renderer.rules.html_inline
      md.renderer.rules.html_inline = (tokens, idx, options, env, self) => {
        const content = tokens[idx].content
        const m = content.match(/^<\/?([a-zA-Z][\w_-]*)/)
        if (m) {
          const tag = m[1]
          if (!knownHtml.has(tag.toLowerCase()) && !knownVue.has(tag) && !/^[A-Z]/.test(tag)) {
            return content.replace(/</g, '&lt;').replace(/>/g, '&gt;')
          }
        }
        return origHtmlInline ? origHtmlInline(tokens, idx, options, env, self) : content
      }

      const origHtmlBlock = md.renderer.rules.html_block
      md.renderer.rules.html_block = (tokens, idx, options, env, self) => {
        const content = tokens[idx].content
        const m = content.match(/^<\/?([a-zA-Z][\w_-]*)/)
        if (m) {
          const tag = m[1]
          if (!knownHtml.has(tag.toLowerCase()) && !knownVue.has(tag) && !/^[A-Z]/.test(tag)) {
            return content.replace(/</g, '&lt;').replace(/>/g, '&gt;')
          }
        }
        return origHtmlBlock ? origHtmlBlock(tokens, idx, options, env, self) : content
      }
    },
  },

  vite: {
    server: {
      host: '0.0.0.0',
      port: 3030,
    },
    plugins: [{
      name: 'auto-restart-on-new-docs',
      configureServer(server) {
        const watcher = server.watcher
        let restartTimer: ReturnType<typeof setTimeout> | null = null
        let isRestarting = false

        function scheduleRestart(reason: string) {
          if (isRestarting) return
          console.log(`[auto-sidebar] ${reason}`)
          if (restartTimer) clearTimeout(restartTimer)
          // 2초 디바운스: 마지막 변경 후 2초 뒤 재시작
          restartTimer = setTimeout(() => {
            console.log('[auto-sidebar] 서버 재시작 중...')
            process.exit(0)  // docs:watch 루프가 자동으로 재시작
          }, 2000)
        }

        function isDocsPath(p: string) {
          return p.startsWith(docsRoot) && !p.includes('.vitepress') && !p.includes('node_modules')
        }

        watcher.on('addDir', (p: string) => { if (isDocsPath(p)) scheduleRestart(`새 디렉토리: ${p}`) })
        watcher.on('add', (p: string) => { if (p.endsWith('.md') && isDocsPath(p)) scheduleRestart(`새 문서: ${p}`) })
        watcher.on('unlink', (p: string) => { if (p.endsWith('.md') && isDocsPath(p)) scheduleRestart(`문서 삭제: ${p}`) })
        watcher.on('unlinkDir', (p: string) => { if (isDocsPath(p)) scheduleRestart(`디렉토리 삭제: ${p}`) })
      }
    }]
  }
})

/**
 * page.tsx: 랜딩 페이지 — content/docs/ 기반 동적 프로젝트 목록
 * 수정일: 2026-04-08
 */
import Link from 'next/link';
import { source } from '@/lib/source';

function getProjectGroups() {
  const allPages = source.getPages();
  const categoryMap = new Map<string, { name: string; desc: string; href: string }[]>();

  // 프로젝트별 첫 페이지를 수집 (index 또는 첫 번째 페이지)
  const projectFirstPage = new Map<string, { name: string; desc: string; href: string }>();

  for (const page of allPages) {
    // /docs/category/project 또는 /docs/category/project/subpage 패턴 매칭
    const match = page.url.match(/^\/docs\/([^/]+)\/([^/]+)/);
    if (!match) continue;
    const [, category, project] = match;
    if (category === 'guide') continue;

    const key = `${category}/${project}`;
    if (!categoryMap.has(category)) categoryMap.set(category, []);

    if (!projectFirstPage.has(key)) {
      // index 페이지이거나 첫 번째 감지된 페이지
      const isIndex = page.url === `/docs/${category}/${project}`;
      projectFirstPage.set(key, {
        name: isIndex ? (page.data.title || project) : project.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        desc: isIndex ? (page.data.description || '') : '',
        href: isIndex ? page.url : page.url,
      });
    } else if (page.url === `/docs/${category}/${project}`) {
      // index 페이지가 나중에 발견되면 덮어쓰기
      projectFirstPage.set(key, {
        name: page.data.title || project,
        desc: page.data.description || '',
        href: page.url,
      });
    }
  }

  // categoryMap에 정리
  for (const [key, item] of projectFirstPage) {
    const category = key.split('/')[0];
    const items = categoryMap.get(category)!;
    if (!items.some(i => i.href === item.href)) {
      items.push(item);
    }
  }

  return [...categoryMap.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([year, items]) => ({ year, items }));
}

export default function HomePage() {
  const projects = getProjectGroups();

  return (
    <main className="flex min-h-screen flex-col items-center px-4 py-16">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-16">
          <h1 className="text-5xl font-bold tracking-tight mb-4">
            Tech Docs Portal
          </h1>
          <p className="text-lg text-fd-muted-foreground max-w-2xl mx-auto">
            사내 프로젝트 기술 문서를 한곳에서 관리하고 검색합니다.
            <br />
            카테고리별 프로젝트 문서를 확인하세요.
          </p>
          <div className="mt-8 flex gap-3 justify-center">
            <Link
              href="/docs"
              className="rounded-lg bg-fd-primary px-6 py-3 text-fd-primary-foreground font-semibold hover:opacity-90 transition-all shadow-sm hover:shadow-md"
            >
              문서 보기
            </Link>
            <a
              href="https://github.com/cmaven"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-fd-border px-6 py-3 font-medium hover:bg-fd-accent hover:border-fd-primary transition-all"
            >
              GitHub
            </a>
          </div>
        </div>

        {projects.map((group) => (
          <section key={group.year} className="mb-12">
            <h2 className="text-2xl font-semibold mb-4 flex items-center gap-2">
              <span className="inline-block w-2 h-2 rounded-full bg-fd-primary" />
              {group.year}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {group.items.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group block rounded-xl border border-fd-border p-6 hover:border-fd-primary hover:shadow-md transition-all"
                >
                  <h3 className="text-lg font-semibold group-hover:text-fd-primary transition-colors">
                    {item.name}
                  </h3>
                  {item.desc && (
                    <p className="text-fd-muted-foreground mt-1 text-sm">
                      {item.desc}
                    </p>
                  )}
                </Link>
              ))}
            </div>
          </section>
        ))}

        <footer className="mt-16 pt-8 border-t border-fd-border text-center text-sm text-fd-muted-foreground">
          Tech Docs Portal — 사내 기술 문서 관리 시스템
        </footer>
      </div>
    </main>
  );
}

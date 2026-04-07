import Link from 'next/link';

const projects = [
  {
    year: '2025',
    items: [
      {
        name: 'Project Alpha',
        desc: '클라우드 인프라 자동화',
        href: '/docs/2025/project-alpha',
        tags: ['Terraform', 'Kubernetes', 'GitHub Actions'],
      },
      {
        name: 'Project Beta',
        desc: '통합 인증 시스템',
        href: '/docs/2025/project-beta',
        tags: ['OAuth 2.0', 'OIDC', 'JWT'],
      },
    ],
  },
  {
    year: '2026',
    items: [
      {
        name: 'Project Gamma',
        desc: '실시간 데이터 파이프라인',
        href: '/docs/2026/project-gamma',
        tags: ['Kafka', 'Flink', 'Iceberg'],
      },
    ],
  },
];

export default function HomePage() {
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
            연도별 프로젝트 문서를 확인하세요.
          </p>
          <div className="mt-8 flex gap-3 justify-center">
            <Link
              href="/docs"
              className="rounded-lg bg-fd-primary px-6 py-3 text-fd-primary-foreground font-medium hover:opacity-90 transition-opacity"
            >
              문서 보기
            </Link>
            <a
              href="https://github.com"
              className="rounded-lg border border-fd-border px-6 py-3 font-medium hover:bg-fd-accent transition-colors"
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
                  key={item.name}
                  href={item.href}
                  className="group block rounded-xl border border-fd-border p-6 hover:border-fd-primary hover:shadow-md transition-all"
                >
                  <h3 className="text-lg font-semibold group-hover:text-fd-primary transition-colors">
                    {item.name}
                  </h3>
                  <p className="text-fd-muted-foreground mt-1 text-sm">
                    {item.desc}
                  </p>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {item.tags.map((tag) => (
                      <span
                        key={tag}
                        className="text-xs px-2 py-1 rounded-md bg-fd-accent text-fd-accent-foreground"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
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

/**
 * docs/layout.tsx: 문서 페이지 레이아웃 (연도별 탭, 버전 선택)
 * 수정일: 2026-04-07
 */
import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import { baseOptions } from '@/app/layout.config';
import { VersionSelector } from '@/components/version-selector';

export default function Layout({ children }: { children: ReactNode }) {
  const allPages = source.getPages();
  const urls2025 = new Set<string>();
  const urls2026 = new Set<string>();

  for (const page of allPages) {
    if (page.url.startsWith('/docs/2025')) urls2025.add(page.url);
    else if (page.url.startsWith('/docs/2026')) urls2026.add(page.url);
  }

  return (
    <DocsLayout
      tree={source.pageTree}
      tabs={[
        { title: '2025', url: '/docs/2025/project-alpha', urls: urls2025 },
        { title: '2026', url: '/docs/2026/project-gamma', urls: urls2026 },
      ]}
      sidebar={{ footer: (
        <div key="sidebar-footer" className="flex items-center gap-2">
          <VersionSelector />
          <a
            href="/docs/2025/guide"
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium
              bg-fd-secondary text-fd-secondary-foreground hover:bg-fd-primary/15
              transition-colors border border-fd-border"
            style={{ height: '32px' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
              <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
            </svg>
            Guide
          </a>
        </div>
      ) }}
      {...baseOptions}
    >
      {children}
    </DocsLayout>
  );
}

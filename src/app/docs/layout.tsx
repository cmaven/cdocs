/**
 * docs/layout.tsx: 문서 페이지 레이아웃 (카테고리별 탭, 버전 선택, Guide 아이콘)
 * 수정일: 2026-04-08
 */
import { source } from '@/lib/source';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import type { ReactNode } from 'react';
import { baseOptions } from '@/app/layout.config';
import { VersionSelector } from '@/components/version-selector';
import { GuideIcon } from '@/components/guide-icon';

export default function Layout({ children }: { children: ReactNode }) {
  const allPages = source.getPages();
  const urls2025 = new Set<string>();
  const urls2026 = new Set<string>();
  const urlsGuide = new Set<string>();

  for (const page of allPages) {
    if (page.url.startsWith('/docs/2025')) urls2025.add(page.url);
    else if (page.url.startsWith('/docs/2026')) urls2026.add(page.url);
    else if (page.url.startsWith('/docs/guide')) urlsGuide.add(page.url);
  }

  return (
    <DocsLayout
      tree={source.pageTree}
      tabs={[
        { title: '2025', url: '/docs/2025/project-alpha', urls: urls2025 },
        { title: '2026', url: '/docs/2026/project-gamma', urls: urls2026 },
        { title: 'Guide', url: '/docs/guide', urls: urlsGuide },
      ]}
      sidebar={{ footer: (
        <div key="sidebar-footer" className="flex items-center gap-2">
          <GuideIcon />
          <VersionSelector />
        </div>
      ) }}
      {...baseOptions}
    >
      {children}
    </DocsLayout>
  );
}

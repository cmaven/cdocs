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
  const categoryMap = new Map<string, Set<string>>();

  for (const page of allPages) {
    const match = page.url.match(/^\/docs\/([^/]+)/);
    if (!match) continue;
    const category = match[1];
    if (!categoryMap.has(category)) categoryMap.set(category, new Set());
    categoryMap.get(category)!.add(page.url);
  }

  // 카테고리 탭 생성 (guide는 마지막, 나머지는 이름순 정렬)
  const tabs = [...categoryMap.entries()]
    .filter(([name]) => name !== 'guide')
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([name, urls]) => {
      const firstUrl = [...urls].sort()[0];
      return { title: name, url: firstUrl, urls };
    });

  // Guide 탭 마지막에 추가
  if (categoryMap.has('guide')) {
    tabs.push({ title: 'Guide', url: '/docs/guide', urls: categoryMap.get('guide')! });
  }

  return (
    <DocsLayout
      tree={source.pageTree}
      tabs={tabs}
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

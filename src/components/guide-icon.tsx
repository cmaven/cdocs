/**
 * guide-icon.tsx: 사이드바 하단 Fumadocs 아이콘 컨테이너에 Guide 아이콘 주입
 * 상세: GitHub, Theme toggle과 같은 컨테이너에 Guide 아이콘을 추가
 * 생성일: 2026-04-08
 */
'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

export function GuideIcon() {
  const injected = useRef(false);
  const router = useRouter();

  useEffect(() => {
    if (injected.current) return;

    const sidebar = document.querySelector('#nd-sidebar');
    if (!sidebar) return;

    // Fumadocs 아이콘 컨테이너: border bg-fd-secondary/50 rounded-lg
    const iconContainer = sidebar.querySelector('.flex.text-fd-muted-foreground.items-center.border');
    if (!iconContainer) return;

    // 이미 주입되었는지 확인
    if (iconContainer.querySelector('[data-guide-icon]')) return;

    // Guide 아이콘 생성 (theme toggle 버튼 앞에 삽입)
    const guideLink = document.createElement('a');
    guideLink.href = '/docs/guide';
    guideLink.setAttribute('data-guide-icon', 'true');
    guideLink.setAttribute('aria-label', 'Guide');
    guideLink.setAttribute('title', 'Guide');
    guideLink.className = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors duration-100 hover:bg-fd-accent hover:text-fd-accent-foreground p-1.5 [&_svg]:size-4.5';
    guideLink.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>`;

    guideLink.addEventListener('click', (e) => {
      e.preventDefault();
      router.push('/docs/guide');
    });

    // theme toggle 버튼 앞에 삽입
    const themeBtn = iconContainer.querySelector('[data-theme-toggle]');
    if (themeBtn) {
      iconContainer.insertBefore(guideLink, themeBtn);
    } else {
      iconContainer.appendChild(guideLink);
    }

    injected.current = true;
  }, [router]);

  return null;
}

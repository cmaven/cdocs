/**
 * asciinema.tsx: Hugo Book Asciinema 숏코드의 MDX 컴포넌트 구현
 * 상세: asciinema-player를 dynamic import로 로드. 다크모드 연동.
 * 생성일: 2026-04-08
 */

'use client';

import { useEffect, useRef, useState } from 'react';
import { useTheme } from 'next-themes';

interface AsciinemaProps {
  src: string;
  rows?: number;
  cols?: number;
  autoPlay?: boolean;
  loop?: boolean;
  speed?: number;
  idleTimeLimit?: number;
  theme?: string;
  poster?: string;
  fit?: 'width' | 'height' | 'both' | 'none';
}

export function Asciinema({
  src,
  rows,
  cols,
  autoPlay = false,
  loop = false,
  speed = 1,
  idleTimeLimit,
  theme: playerTheme,
  poster,
  fit = 'width',
}: AsciinemaProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<unknown>(null);
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || !containerRef.current) return;

    let cancelled = false;

    (async () => {
      try {
        const AsciinemaPlayerModule = await import('asciinema-player');
        if (cancelled || !containerRef.current) return;

        // 이전 플레이어 정리
        if (playerRef.current && typeof (playerRef.current as { dispose?: () => void }).dispose === 'function') {
          (playerRef.current as { dispose: () => void }).dispose();
        }
        containerRef.current.innerHTML = '';

        const effectiveTheme = playerTheme ?? (resolvedTheme === 'dark' ? 'monokai' : 'asciinema');

        playerRef.current = AsciinemaPlayerModule.create(src, containerRef.current, {
          rows,
          cols,
          autoPlay,
          loop,
          speed,
          idleTimeLimit,
          theme: effectiveTheme,
          poster,
          fit,
        });
      } catch (e) {
        if (!cancelled) {
          setError(`Asciinema 로드 실패: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    })();

    return () => {
      cancelled = true;
      if (playerRef.current && typeof (playerRef.current as { dispose?: () => void }).dispose === 'function') {
        (playerRef.current as { dispose: () => void }).dispose();
      }
    };
  }, [mounted, src, resolvedTheme, rows, cols, autoPlay, loop, speed, idleTimeLimit, playerTheme, poster, fit]);

  if (!mounted) {
    return <div className="my-4 p-4 rounded-lg bg-fd-muted animate-pulse h-48" />;
  }

  if (error) {
    return <div className="my-4 p-4 rounded-lg bg-fd-muted text-red-500">{error}</div>;
  }

  return (
    <div className="mdx-asciinema my-6">
      <div ref={containerRef} />
    </div>
  );
}

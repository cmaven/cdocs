/**
 * button.tsx: Hugo Book Button 숏코드의 MDX 컴포넌트 구현
 * 상세: 스타일드 링크 버튼. 외부 링크 자동 감지.
 * 생성일: 2026-04-08
 */

import type { ReactNode, AnchorHTMLAttributes } from 'react';

interface ButtonProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className'> {
  href: string;
  variant?: 'outline' | 'solid';
  children: ReactNode;
}

export function Button({ href, variant = 'outline', children, ...props }: ButtonProps) {
  const isExternal = href.startsWith('http://') || href.startsWith('https://');
  const externalProps = isExternal
    ? { target: '_blank' as const, rel: 'noopener noreferrer' }
    : {};

  return (
    <a
      href={href}
      className={`mdx-button mdx-button--${variant}`}
      {...externalProps}
      {...props}
    >
      {children}
      {isExternal && (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ marginLeft: '4px', display: 'inline-block', verticalAlign: 'middle' }}
        >
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      )}
    </a>
  );
}

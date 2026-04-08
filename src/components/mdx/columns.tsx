/**
 * columns.tsx: Hugo Book Columns 숏코드의 MDX 컴포넌트 구현
 * 상세: Flexbox 기반 다단 레이아웃. ratio prop으로 비율 제어. 반응형.
 * 생성일: 2026-04-08
 */

import type { ReactNode, CSSProperties } from 'react';

interface ColumnsProps {
  ratio?: string;
  children: ReactNode;
  className?: string;
}

interface ColumnProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function Columns({ ratio, children, className }: ColumnsProps) {
  const ratios = ratio ? ratio.split(':').map(Number) : [];

  return (
    <div className={`mdx-columns ${className ?? ''}`}>
      {Array.isArray(ratios) && ratios.length > 0
        ? applyRatios(children, ratios)
        : children}
    </div>
  );
}

export function Column({ children, className, style }: ColumnProps) {
  return (
    <div className={`mdx-column ${className ?? ''}`} style={style}>
      {children}
    </div>
  );
}

function applyRatios(children: ReactNode, ratios: number[]): ReactNode {
  if (!Array.isArray(children)) return children;
  return (children as ReactNode[]).map((child, i) => {
    const flex = ratios[i] ?? 1;
    if (child && typeof child === 'object' && 'props' in child) {
      return (
        <div key={i} className="mdx-column" style={{ flex }}>
          {(child as { props: { children: ReactNode } }).props.children}
        </div>
      );
    }
    return (
      <div key={i} className="mdx-column" style={{ flex }}>
        {child}
      </div>
    );
  });
}

/**
 * details.tsx: Hugo Book Details 숏코드의 MDX 래퍼 컴포넌트
 * 상세: Accordion을 Accordions로 자동 래핑하여 단독 사용 가능하게 함.
 * 생성일: 2026-04-08
 */

import { Accordions, Accordion } from 'fumadocs-ui/components/accordion';
import type { ReactNode } from 'react';

interface DetailsProps {
  title: string | ReactNode;
  children: ReactNode;
}

export function Details({ title, children }: DetailsProps) {
  return (
    <Accordions type="single" collapsible>
      <Accordion title={title}>{children}</Accordion>
    </Accordions>
  );
}

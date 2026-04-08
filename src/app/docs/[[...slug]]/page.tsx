import { source } from '@/lib/source';
import {
  DocsPage,
  DocsBody,
  DocsDescription,
  DocsTitle,
} from 'fumadocs-ui/page';
import { notFound } from 'next/navigation';
import defaultMdxComponents from 'fumadocs-ui/mdx';
import { Mermaid } from '@/components/mdx/mermaid';
import { Tabs, Tab } from 'fumadocs-ui/components/tabs';
import { Callout } from 'fumadocs-ui/components/callout';
import { Steps, Step } from 'fumadocs-ui/components/steps';
import { Accordions, Accordion } from 'fumadocs-ui/components/accordion';
import { Badge } from '@/components/mdx/badge';
import { Button } from '@/components/mdx/button';
import { Columns, Column } from '@/components/mdx/columns';
import { Asciinema } from '@/components/mdx/asciinema';
import { Details } from '@/components/mdx/details';
import type { ReactElement } from 'react';

const MERMAID_KEYWORDS = ['graph ', 'graph\n', 'flowchart ', 'sequenceDiagram', 'classDiagram', 'stateDiagram', 'erDiagram', 'gantt', 'pie ', 'gitGraph', 'journey', 'mindmap', 'timeline', 'quadrantChart', 'xychart', 'block-beta', 'sankey'];

function extractText(node: unknown): string {
  if (typeof node === 'string') return node;
  if (!node || typeof node !== 'object') return '';
  const el = node as { props?: { children?: unknown } };
  if (el.props?.children) {
    if (typeof el.props.children === 'string') return el.props.children;
    if (Array.isArray(el.props.children)) return el.props.children.map(extractText).join('');
    return extractText(el.props.children);
  }
  return '';
}

function MdxPre(props: React.ComponentProps<'pre'>) {
  const child = props.children as ReactElement<{
    className?: string;
    children?: unknown;
  }>;
  // className 기반 감지 (Shiki 미처리 시)
  if (child?.props?.className === 'language-mermaid') {
    const text = typeof child.props.children === 'string' ? child.props.children : '';
    return <Mermaid chart={text} />;
  }
  // 텍스트 내용 기반 감지 (Shiki 처리 후)
  const text = extractText(child).trim();
  if (MERMAID_KEYWORDS.some((kw) => text.startsWith(kw))) {
    return <Mermaid chart={text} />;
  }
  return <defaultMdxComponents.pre {...props} />;
}

export default async function Page(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  const MDX = page.data.body;

  return (
    <DocsPage toc={page.data.toc} full={page.data.full}>
      <DocsTitle>{page.data.title}</DocsTitle>
      <DocsDescription>{page.data.description}</DocsDescription>
      <DocsBody>
        <MDX components={{
          ...defaultMdxComponents,
          pre: MdxPre,
          Mermaid,
          // Fumadocs 내장 컴포넌트
          Tabs, Tab,
          Callout,
          Steps, Step,
          Accordions, Accordion,
          // 커스텀 컴포넌트
          Badge, Button, Columns, Column,
          Asciinema,
          // Hugo 스타일 별칭 (간편 문법)
          Hint: Callout,
          Details,
        }} />
      </DocsBody>
    </DocsPage>
  );
}

export async function generateStaticParams() {
  return source.generateParams();
}

export async function generateMetadata(props: {
  params: Promise<{ slug?: string[] }>;
}) {
  const params = await props.params;
  const page = source.getPage(params.slug);
  if (!page) notFound();

  return {
    title: page.data.title,
    description: page.data.description,
  };
}

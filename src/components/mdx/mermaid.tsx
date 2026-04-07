'use client';

import { useEffect, useId, useState } from 'react';
import { useTheme } from 'next-themes';

export function Mermaid({ chart }: { chart: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted) return <div className="my-4 p-4 rounded-lg bg-fd-muted animate-pulse h-32" />;
  return <MermaidRenderer chart={chart} />;
}

function MermaidRenderer({ chart }: { chart: string }) {
  const id = useId().replace(/:/g, '-');
  const { resolvedTheme } = useTheme();
  const [svg, setSvg] = useState('');

  useEffect(() => {
    let cancelled = false;
    import('mermaid').then(({ default: mermaid }) => {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'loose',
        fontFamily: 'inherit',
        theme: resolvedTheme === 'dark' ? 'dark' : 'default',
      });
      const renderId = `mermaid${id}${Date.now()}`;
      mermaid.render(renderId, chart.replaceAll('\\n', '\n')).then(({ svg: result }) => {
        if (!cancelled) setSvg(result);
      }).catch(() => {
        if (!cancelled) setSvg(`<pre style="color:red">Mermaid 렌더링 실패</pre>`);
      });
    });
    return () => { cancelled = true; };
  }, [chart, resolvedTheme, id]);

  if (!svg) return <div className="my-4 p-4 rounded-lg bg-fd-muted animate-pulse h-32" />;

  return (
    <div
      className="my-6 flex justify-center overflow-x-auto rounded-lg border border-fd-border p-4 bg-fd-card [&>svg]:max-w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export const baseOptions: BaseLayoutProps = {
  nav: {
    title: (
      <span className="font-semibold">Tech Docs Portal</span>
    ),
  },
  links: [
    {
      text: 'GitHub',
      url: 'https://github.com',
    },
  ],
};

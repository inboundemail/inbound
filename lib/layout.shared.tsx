import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: 'inbound docs',
      url: '/docs',
    },
    links: [
      {
        text: 'API Reference',
        url: '/docs/api',
        active: 'nested-url',
      },
      {
        text: 'Back to App',
        url: '/',
      },
    ],
  };
}

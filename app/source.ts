import { loader } from 'fumadocs-core/source';

// Simple page tree for now - can be expanded with actual MDX content later
export const { getPage, getPages, pageTree } = loader({
  baseUrl: '/docs',
  source: {
    files: [
      {
        type: 'page',
        path: '/docs',
        data: {
          title: 'Getting Started',
          description: 'Get started with Inbound.new API',
        },
      },
    ],
  },
});
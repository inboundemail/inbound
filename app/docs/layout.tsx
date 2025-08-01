import type { ReactNode } from 'react';
import { DocsLayout } from 'fumadocs-ui/layouts/docs';
import { pageTree } from '@/app/source';
import { RootProvider } from 'fumadocs-ui/provider';
import 'fumadocs-ui/style.css';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <RootProvider>
      <DocsLayout tree={pageTree} nav={{ title: 'Inbound.new Documentation' }}>
        {children}
      </DocsLayout>
    </RootProvider>
  );
}
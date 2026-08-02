import { RootProvider } from 'fumadocs-ui/provider/next';
import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './global.css';

const geist = Geist({
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://inbound.new'),
  title: {
    default: 'Inbound Documentation',
    template: '%s | Inbound',
  },
  description: 'Build complete email workflows with Inbound.',
  icons: {
    icon: '/favicon.svg',
  },
};

export default function Layout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={geist.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen">
        <RootProvider theme={{ defaultTheme: 'dark' }}>{children}</RootProvider>
      </body>
    </html>
  );
}

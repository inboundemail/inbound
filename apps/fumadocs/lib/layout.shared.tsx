import type { BaseLayoutProps } from 'fumadocs-ui/layouts/shared';
import Image from 'next/image';
import { appName, gitConfig } from '@/lib/shared';

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: (
        <>
          <Image
            alt={appName}
            className="dark:hidden"
            height={30}
            src="/logo/light.svg"
            width={106}
          />
          <Image
            alt={appName}
            className="hidden dark:block"
            height={30}
            src="/logo/dark.svg"
            width={106}
          />
        </>
      ),
      url: '/docs',
    },
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
    links: [
      {
        text: 'Mail Flow',
        url: 'https://inbound.new/logs',
        external: true,
      },
      {
        type: 'button',
        text: 'Get Started',
        url: 'https://inbound.new',
        external: true,
      },
    ],
  };
}

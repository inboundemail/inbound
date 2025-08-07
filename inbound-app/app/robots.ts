import { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_BETTER_AUTH_URL || 'https://inbound.exon.dev'

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/api/',
          '/(main)/',
          '/actions/',
          '/configure/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  }
}
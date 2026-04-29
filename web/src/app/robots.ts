import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/dashboard/', '/api/', '/onboarding/'],
    },
    sitemap: 'https://noomachy.com/sitemap.xml',
    host: 'https://noomachy.com',
  };
}

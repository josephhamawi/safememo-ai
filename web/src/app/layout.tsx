import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Providers } from './providers';
import { ToastContainer } from '@/components/ui/Toast';
import './globals.css';

const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://noomachy.com'),
  title: 'SafeMemo AI — Auditable memory for legal AI agents',
  description: 'Memory your AI can defend in a deposition. Human-validated facts, SHA-256 hash-chained audit trails, and signed share links for outside counsel.',
  icons: {
    icon: [
      { url: '/favicon.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon.png', sizes: '659x659', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'SafeMemo AI — Auditable memory for legal AI agents',
    description: 'Memory your AI can defend in a deposition. Human-validated facts, SHA-256 hash-chained audit trails, and signed share links for outside counsel.',
    url: 'https://noomachy.com',
    siteName: 'SafeMemo AI',
    images: [{ url: '/og-image.png', width: 659, height: 659 }],
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'SafeMemo AI — Auditable memory for legal AI agents',
    description: 'Memory your AI can defend in a deposition. Built for legal teams.',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} dark h-full antialiased`}>
      <body className="min-h-full bg-black font-sans text-zinc-100">
        <Providers>{children}</Providers>
        <ToastContainer />
      </body>
    </html>
  );
}

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
  title: 'Noomachy - AI Agent Platform',
  description: 'AI agents with sovereign memory. Build intelligent agents that learn, remember, and use tools autonomously.',
  icons: {
    icon: [
      { url: '/favicon.png', sizes: '32x32', type: 'image/png' },
      { url: '/icon.png', sizes: '659x659', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  openGraph: {
    title: 'Noomachy - AI Agent Platform',
    description: 'AI agents with sovereign memory. Build intelligent agents that learn, remember, and use tools autonomously.',
    url: 'https://noomachy.com',
    siteName: 'Noomachy',
    images: [{ url: '/og-image.png', width: 659, height: 659 }],
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Noomachy - AI Agent Platform',
    description: 'AI agents with sovereign memory.',
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

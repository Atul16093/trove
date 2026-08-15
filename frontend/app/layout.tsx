import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Trove — save anything, find everything',
  description: 'Your saved links, organized for you, findable in seconds.',
  applicationName: 'Trove',
  // app/icon.svg is picked up by the app-router file convention; naming it here
  // keeps the type explicit for crawlers that prefer it.
  icons: { icon: [{ url: '/icon.svg', type: 'image/svg+xml' }] },
};

/** Matches the --base token so browser chrome tracks the app's theme. */
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F2F2F7' },
    { media: '(prefers-color-scheme: dark)', color: '#131315' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

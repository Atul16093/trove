import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Trove — save anything, find everything',
  description: 'Your saved links, organized for you, findable in seconds.',
  applicationName: 'Trove',
  // No `icons` key on purpose: app/icon.svg and app/apple-icon.png are emitted
  // by the app-router file conventions, and declaring `icons` here would
  // override that set — which silently dropped the apple-touch-icon link.
  // installed on iOS: run without Safari chrome and title the home-screen entry
  appleWebApp: { capable: true, title: 'Trove', statusBarStyle: 'default' },
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

import type { MetadataRoute } from 'next';

/**
 * PWA manifest. Next serves this at /manifest.webmanifest and links it
 * automatically — no <link rel="manifest"> needed in the layout.
 *
 * Two icon purposes on purpose: "any" is the rounded tile shown as-is, while
 * "maskable" is full-bleed with the mark inside the 80% safe circle so Android
 * can crop it to a circle, squircle or teardrop without clipping the chest.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Trove — save anything, find everything',
    short_name: 'Trove',
    description: 'Your saved links, organized for you, findable in seconds.',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#F2F2F7', // matches --base (light)
    theme_color: '#0A84FF',      // matches --accent
    categories: ['productivity', 'utilities'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

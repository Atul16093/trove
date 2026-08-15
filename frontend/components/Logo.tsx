'use client';
import { useId } from 'react';

/**
 * The Trove mark: a treasure chest, reduced to two shapes and a keyhole.
 *
 * Concept — "trove" is a store of valuable things you collect, keep, and come
 * back to. A chest says all three at once (a vault only says "locked", a gem
 * only says "valuable", a bookmark only says "saved"), and it's the one image
 * the word itself carries, so the mark and the name reinforce each other.
 *
 * Execution notes, all in service of staying legible at 16px:
 *  - Three elements total: domed lid, body, keyhole. No outlines, no fine detail.
 *  - The lid/body seam is a *tonal* step between two adjoining shapes, not a
 *    hairline — a 1px rule would turn to mud at favicon size, a tone shift
 *    never does, at any scale.
 *  - The keyhole is knocked out through both shapes with a mask, so the mark is
 *    a true single-colour silhouette that sits on any background.
 *  - Everything is currentColor, so it inherits the accent token in the sidebar
 *    and flips correctly between light and dark with the rest of the UI.
 */
export function Logo({ size = 24, className }: { size?: number; className?: string }) {
  // useId can emit ':' which is invalid inside url(#...) — strip it.
  const maskId = `trove-keyhole-${useId().replace(/:/g, '')}`;

  return (
    <svg
      width={size} height={size} viewBox="0 0 32 32"
      fill="none" aria-hidden="true" focusable="false" className={className}
    >
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
        <rect width="32" height="32" fill="#fff" />
        <path d="M16 11.4a3 3 0 0 1 3 3v3.2a3 3 0 1 1-6 0v-3.2a3 3 0 0 1 3-3Z" fill="#000" />
      </mask>
      <g mask={`url(#${maskId})`} fill="currentColor">
        {/* lid — a dome, the heavier of the two tones */}
        <path d="M3 15v-1.5C3 8.8 8.82 5 16 5s13 3.8 13 8.5V15Z" />
        {/* body — same colour, lighter, so the seam reads without a line */}
        <path opacity="0.62" d="M3 15h26v7.5a4.5 4.5 0 0 1-4.5 4.5h-17A4.5 4.5 0 0 1 3 22.5Z" />
      </g>
    </svg>
  );
}

export default Logo;

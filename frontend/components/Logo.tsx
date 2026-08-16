'use client';
import { useId } from 'react';

/**
 * The Trove mark: a treasure chest — flat lid with an overhanging rim, body,
 * and a latch plate punched through both.
 *
 * Concept — "trove" is a store of valuable things you collect, keep, and come
 * back to. A chest carries all three at once (a vault only says "locked", a gem
 * only "valuable", a bookmark only "saved"), and it's the image the word itself
 * already suggests, so mark and name reinforce each other.
 *
 * Why it's drawn this way, all in service of reading at 16px:
 *  - Three elements only: lid, body, latch. No outlines, no fine detail.
 *  - A *flat* lid with rounded top corners, not a dome — a dome reads as a bag
 *    or basket; the flat top plus the 1.5-unit rim overhang is what makes it a
 *    chest, and both survive downscaling because they're big shapes.
 *  - The lid/body seam is a tonal step between two adjoining shapes, never a
 *    hairline; a 1px rule turns to mud at favicon size, a tone shift never does.
 *  - The latch is punched through with a mask, so the mark is a true one-colour
 *    silhouette that sits on any background, and it straddles the seam (11.6 →
 *    17.4 around a seam at 14.5) the way a real hasp does.
 *  - Everything is currentColor, so it takes the accent token and flips with
 *    the theme alongside the rest of the UI.
 */

// LOGO_GEOMETRY_START — parsed by scripts/generate-icons.mjs. Keep the shape
// `export const NAME = '...';` on one line so the favicon and PWA icons stay
// generated from exactly these paths.
export const LID = 'M2.5 14.5V12.5A4.5 4.5 0 0 1 7 8h18a4.5 4.5 0 0 1 4.5 4.5v2Z';
export const BODY = 'M4 14.5h24V22a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4Z';
export const LATCH = 'M14.9 11.6h2.2a1.8 1.8 0 0 1 1.8 1.8v2.2a1.8 1.8 0 0 1-1.8 1.8h-2.2a1.8 1.8 0 0 1-1.8-1.8v-2.2a1.8 1.8 0 0 1 1.8-1.8Z';
// LOGO_GEOMETRY_END

/** Opacity of the body against the lid — the seam is this tonal step. */
export const BODY_OPACITY = 0.58;

export function Logo({ size = 24, className }: { size?: number; className?: string }) {
  // useId can emit ':' which is invalid inside url(#...) — strip it.
  const maskId = `trove-latch-${useId().replace(/:/g, '')}`;

  return (
    <svg
      width={size} height={size} viewBox="0 0 32 32"
      fill="none" aria-hidden="true" focusable="false" className={className}
    >
      <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
        <rect width="32" height="32" fill="#fff" />
        <path d={LATCH} fill="#000" />
      </mask>
      <g mask={`url(#${maskId})`} fill="currentColor">
        <path d={LID} />
        <path d={BODY} opacity={BODY_OPACITY} />
      </g>
    </svg>
  );
}

export default Logo;

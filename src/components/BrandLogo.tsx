import React from "react";

/**
 * Sitetru brand mark — three ascending rounded bars on a rounded cobalt tile:
 * a rising skyline, progress trending up. Size comes from `className`.
 *
 * White bars on a cobalt tile, chosen for small sizes. The obvious alternative
 * -- cobalt bars on the deep navy tile -- measures 2.40:1 between bar and tile
 * and merges into a solid square at favicon size; white on cobalt is 6.70:1
 * and still reads at 16px. The tile is 6.24:1 on the light page and 3.11:1 on
 * the dark canvas: visible on both without needing a second drawing.
 */
export const BrandLogo: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 512 512"
    className={className}
    role="img"
    aria-label="Sitetru"
  >
    {/* Fixed, not tokenised: a brand mark has to be the same drawing in
        both themes, and it is also rasterised into favicons and the PWA
        icons where no CSS variable exists. */}
    <rect width="512" height="512" rx="116" fill="#1D4ED8" />
    <rect x="136" y="272" width="72" height="104" rx="22" fill="#FFFFFF" />
    <rect x="222" y="212" width="72" height="164" rx="22" fill="#FFFFFF" />
    <rect x="308" y="140" width="72" height="236" rx="22" fill="#FFFFFF" />
  </svg>
);

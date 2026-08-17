import React from "react";

/**
 * Sitetru brand mark — a bold rising checkmark on a rounded Drab tile.
 * The dip reads as "verified" and the tall up-stroke as a structure rising from
 * the ground: truth, trending up, from site. Sage down-stroke into a rust
 * up-stroke, in the Rust / Sage / Drab palette. Size comes from `className`.
 */
export const BrandLogo: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 512 512"
    className={className}
    role="img"
    aria-label="Sitetru"
  >
    <rect width="512" height="512" rx="116" fill="#324755" />
    {/* down-stroke (approach) in sage */}
    <path
      d="M150 280 L230 356"
      fill="none"
      stroke="#87BCBF"
      strokeWidth="54"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    {/* up-stroke (the rise) in rust */}
    <path
      d="M230 356 L372 150"
      fill="none"
      stroke="#D97D54"
      strokeWidth="54"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

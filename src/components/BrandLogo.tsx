import React from "react";

/**
 * Sitetru brand mark — a site pin holding a small structure
 * ("truth, reported from site"), in the Rust / Sage / Drab palette.
 * Renders a rounded Drab tile; size and extra styling come from `className`.
 */
export const BrandLogo: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 512 512"
    className={className}
    role="img"
    aria-label="Sitetru"
  >
    <rect width="512" height="512" rx="116" fill="#324755" />
    <circle cx="256" cy="206" r="132" fill="#D97D54" />
    <path d="M150 268 L256 452 L362 268 Z" fill="#D97D54" />
    <circle cx="256" cy="200" r="60" fill="#F0F3F4" />
    <path
      d="M222 224 L256 178 L290 224"
      fill="none"
      stroke="#324755"
      strokeWidth="20"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

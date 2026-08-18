import React from "react";

/**
 * Sitetru brand mark — three ascending rounded bars on a rounded Drab tile:
 * a rising skyline / progress trending up, in the Rust / Sage / Drab palette
 * (two rust bars stepping up to a sage peak). Size comes from `className`.
 */
export const BrandLogo: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 512 512"
    className={className}
    role="img"
    aria-label="Sitetru"
  >
    <rect width="512" height="512" rx="116" fill="#324755" />
    <rect x="136" y="272" width="72" height="104" rx="22" fill="#D97D54" />
    <rect x="222" y="212" width="72" height="164" rx="22" fill="#D97D54" />
    <rect x="308" y="140" width="72" height="236" rx="22" fill="#87BCBF" />
  </svg>
);

import { useState, useEffect } from "react";

export type Breakpoint = "mobile" | "tablet" | "desktop";

// Matches Tailwind's default breakpoints: sm=640px, md=768px, lg=1024px
function getBreakpoint(width: number): Breakpoint {
  if (width < 768) return "mobile";
  if (width < 1024) return "tablet";
  return "desktop";
}

export function useBreakpoint(): Breakpoint {
  const [breakpoint, setBreakpoint] = useState<Breakpoint>(() =>
    typeof window !== "undefined" ? getBreakpoint(window.innerWidth) : "desktop"
  );

  useEffect(() => {
    const mediaQueries = [
      window.matchMedia("(max-width: 767px)"),
      window.matchMedia("(min-width: 768px) and (max-width: 1023px)"),
      window.matchMedia("(min-width: 1024px)")
    ];
    const update = () => setBreakpoint(getBreakpoint(window.innerWidth));
    mediaQueries.forEach((mq) => mq.addEventListener("change", update));
    update();
    return () => mediaQueries.forEach((mq) => mq.removeEventListener("change", update));
  }, []);

  return breakpoint;
}

// Convenience helpers for the common cases
export function useIsMobile(): boolean {
  return useBreakpoint() === "mobile";
}
export function useIsDesktop(): boolean {
  return useBreakpoint() !== "mobile"; // tablet+desktop both get the "larger" treatment where only a binary split is needed
}

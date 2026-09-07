import React, {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

/**
 * A tooltip that works on a phone.
 *
 * The app had 65 native `title=` attributes. Native `title` is not useless --
 * measured in Chromium it does supply an accessible name to an icon-only
 * button -- but it never appears on touch, and this product is read on site,
 * on a phone, one-handed. It also does not appear on keyboard focus, arrives
 * after a ~1s delay the user cannot predict, and cannot be styled.
 *
 * So `title` is replaced, not merely wrapped:
 *   - `aria-label` carries the accessible name. This is not optional -- strip
 *     `title` from an icon-only control without it and the button becomes
 *     genuinely unnamed, which is worse than where we started.
 *   - This component carries the *visible* hint, on hover, on focus, and on
 *     tap.
 *
 * The child is cloned rather than wrapped in a span, so no layout box is
 * introduced into a flex or grid row. The bubble is portalled to <body> and
 * positioned fixed, because a good number of these controls sit inside
 * `overflow-hidden` cards that would otherwise clip it.
 */

type Side = "top" | "bottom" | "left" | "right";

interface TooltipProps {
  /** The hint. Nothing renders when this is empty. */
  label?: React.ReactNode;
  /** Preferred side; flips automatically when there is no room. */
  side?: Side;
  /**
   * Sets `aria-label` on the child from `label` as well. On by default: these
   * are overwhelmingly icon-only controls whose only name was the `title` we
   * are removing. Turn it off when the child already has visible text or its
   * own `aria-label`.
   */
  nameChild?: boolean;
  children: React.ReactElement;
}

const GAP = 8;

export const Tooltip: React.FC<TooltipProps> = ({
  label,
  side = "top",
  nameChild = true,
  children,
}) => {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const anchor = useRef<HTMLElement | null>(null);
  const bubble = useRef<HTMLDivElement | null>(null);

  const place = useCallback(() => {
    const a = anchor.current;
    const b = bubble.current;
    if (!a || !b) return;
    const r = a.getBoundingClientRect();
    const bw = b.offsetWidth;
    const bh = b.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Flip to the other side when the preferred one would overflow.
    let s = side;
    if (s === "top" && r.top - bh - GAP < 0) s = "bottom";
    else if (s === "bottom" && r.bottom + bh + GAP > vh) s = "top";
    else if (s === "left" && r.left - bw - GAP < 0) s = "right";
    else if (s === "right" && r.right + bw + GAP > vw) s = "left";

    let top: number;
    let left: number;
    if (s === "top" || s === "bottom") {
      top = s === "top" ? r.top - bh - GAP : r.bottom + GAP;
      left = r.left + r.width / 2 - bw / 2;
    } else {
      top = r.top + r.height / 2 - bh / 2;
      left = s === "left" ? r.left - bw - GAP : r.right + GAP;
    }
    // Keep it on screen; a hint half off the edge is no hint.
    left = Math.min(Math.max(GAP, left), vw - bw - GAP);
    top = Math.min(Math.max(GAP, top), vh - bh - GAP);
    setPos({ top, left });
  }, [side]);

  useEffect(() => {
    if (!open) return;
    place();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const close = () => setOpen(false);
    window.addEventListener("keydown", onKey);
    // Any scroll moves the anchor out from under a fixed bubble.
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open, place]);

  if (!label || !isValidElement(children)) return children ?? null;

  const props = children.props as Record<string, unknown>;
  const chain =
    (name: string) =>
    (e: React.SyntheticEvent) => {
      (props[name] as ((ev: React.SyntheticEvent) => void) | undefined)?.(e);
    };

  const child = cloneElement(children as React.ReactElement<Record<string, unknown>>, {
    ref: (node: HTMLElement | null) => {
      anchor.current = node;
      const r = (children as unknown as { ref?: unknown }).ref;
      if (typeof r === "function") (r as (n: HTMLElement | null) => void)(node);
      else if (r && typeof r === "object")
        (r as { current: HTMLElement | null }).current = node;
    },
    // `title` is deliberately not forwarded: two tooltips for one control.
    "aria-describedby": open ? id : undefined,
    ...(nameChild && !props["aria-label"] && typeof label === "string"
      ? { "aria-label": label }
      : {}),
    onMouseEnter: (e: React.SyntheticEvent) => {
      chain("onMouseEnter")(e);
      setOpen(true);
    },
    onMouseLeave: (e: React.SyntheticEvent) => {
      chain("onMouseLeave")(e);
      setOpen(false);
    },
    onFocus: (e: React.SyntheticEvent) => {
      chain("onFocus")(e);
      setOpen(true);
    },
    onBlur: (e: React.SyntheticEvent) => {
      chain("onBlur")(e);
      setOpen(false);
    },
    // Touch: show on tap. The control's own onClick still runs, so this adds
    // the hint without stealing the action.
    onTouchStart: (e: React.SyntheticEvent) => {
      chain("onTouchStart")(e);
      setOpen(true);
    },
  });

  return (
    <>
      {child}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={bubble}
            id={id}
            role="tooltip"
            style={{
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              visibility: pos ? "visible" : "hidden",
            }}
            // A white-alpha edge and a real shadow, not --surface-edge: the bubble
            // has to separate from a white card AND from the navy header band
            // it may overlap, and a navy hairline vanishes against the latter.
            className="fixed z-[400] pointer-events-none max-w-[16rem] px-2.5 py-1.5 rounded-lg bg-surface-dark text-white text-[12px] font-medium leading-snug shadow-xl shadow-surface-dark/40 border border-white/15 on-dark"
          >
            {label}
          </div>,
          document.body,
        )}
    </>
  );
};

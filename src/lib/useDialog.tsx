import React from "react";
import { useEffect, useId, useRef } from "react";
import type { Ref } from "react";

/**
 * Modal behaviour for the 40 dialogs already in the app.
 *
 * They were audited and, between them, one handled Escape, none trapped
 * focus, none locked the background from scrolling, and two declared
 * `role="dialog"`. Measured in the demo: opening the WBS edit-task modal and
 * scrolling moved the page behind it 324px, and Escape did nothing.
 *
 * This is a hook rather than a `<Modal>` component on purpose. The 40
 * envelopes are not one shape -- there are centred panels, a right-hand
 * drawer with a spring transition, a `<motion.form>` acting as the panel, and
 * one that switches between fullscreen and centred by breakpoint. Rewriting
 * all of them into a single component would mean touching every form in the
 * product to fix behaviour that lives entirely outside the markup. Spreading
 * the returned props onto the existing panel changes no layout and no
 * animation.
 *
 *   const dialog = useDialog({ open: isOpen, onClose, label: "Edit task" });
 *   ...
 *   <motion.div {...dialog.panelProps} className="...unchanged...">
 *
 * Scroll lock note: this app does not scroll `<body>`. Layout scrolls an
 * inner `div.flex-1.overflow-y-auto`, so `overflow: hidden` on the body is a
 * no-op here. The lock finds whatever is actually scrollable and skips the
 * dialog's own scroll area, which is usually `max-h-[90vh] overflow-y-auto`
 * on the panel itself.
 */

/** Topmost dialog wins Escape, so nesting closes one layer at a time. */
const stack: symbol[] = [];

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function lockScroll(panel: HTMLElement | null): () => void {
  const locked: Array<[HTMLElement, string]> = [];
  const candidates: HTMLElement[] = [
    document.documentElement,
    document.body,
    // Narrowed to elements that declare scrolling. Reading computed style for
    // every node in the document on each open costs more than it finds.
    ...Array.from(
      document.querySelectorAll<HTMLElement>(
        '[class*="overflow-y-auto"],[class*="overflow-auto"],[class*="overflow-y-scroll"],[class*="overflow-scroll"]',
      ),
    ).filter((el) => el.scrollHeight > el.clientHeight + 1),
  ];
  for (const el of candidates) {
    // Never lock the dialog's own scroll area, or an ancestor it lives inside
    // that IS the dialog (the panel and its children).
    if (panel && (el === panel || panel.contains(el))) continue;
    locked.push([el, el.style.overflow]);
    el.style.overflow = "hidden";
  }
  return () => {
    for (const [el, prev] of locked) el.style.overflow = prev;
  };
}

interface Options {
  open: boolean;
  onClose: () => void;
  /**
   * Only for a dialog with no visible title. Prefer spreading `titleProps`
   * onto the heading the dialog already shows: `aria-labelledby` points at
   * real, already-translated words, where `label` would mean inventing a new
   * string in both languages for every one of the forty.
   */
  label?: string;
  /** Escape closes. Off for a dialog mid-save that must not be abandoned. */
  closeOnEscape?: boolean;
}

export function useDialog({ open, onClose, label, closeOnEscape = true }: Options) {
  const titleId = useId();
  const panel = useRef<HTMLElement | null>(null);
  const restoreTo = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const id = Symbol("dialog");
    stack.push(id);
    const isTop = () => stack[stack.length - 1] === id;

    // Whatever opened this gets focus back when it closes.
    restoreTo.current = document.activeElement as HTMLElement | null;
    const node = panel.current;

    const unlock = lockScroll(node);

    // Move focus in, so the next Tab lands inside rather than behind.
    const first = node?.querySelector(FOCUSABLE) as HTMLElement | null | undefined;
    (first ?? node)?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (!isTop()) return;
      if (e.key === "Escape" && closeOnEscape) {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !node) return;
      const items: HTMLElement[] = Array.from(
        node.querySelectorAll(FOCUSABLE) as NodeListOf<HTMLElement>,
      ).filter((el) => el.offsetWidth > 0 || el.offsetHeight > 0);
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement;
      // Wrap at both ends, and pull focus back if it has escaped the panel.
      if (!node.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? lastItem : firstItem).focus();
      } else if (e.shiftKey && active === firstItem) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && active === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      unlock();
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      restoreTo.current?.focus({ preventScroll: true });
    };
  }, [open, closeOnEscape]);

  return {
    /** Spread onto the panel element -- the card, form or drawer. */
    panelProps: {
      // One ref serves a div, a form or an aside, so it is widened here
      // rather than at each of the forty call sites.
      ref: panel as unknown as Ref<never>,
      role: "dialog",
      "aria-modal": true,
      tabIndex: -1,
      ...(label ? { "aria-label": label } : { "aria-labelledby": titleId }),
    },
    /** Spread onto the dialog's visible heading. */
    titleProps: { id: titleId },
  };
}

/**
 * Retrofit for the modals that already exist.
 *
 * `useDialog` is the API for new code, but it cannot be dropped into the
 * thirty-seven dialogs already here: a hook runs at the top of a component,
 * and these panels are rendered conditionally deep inside JSX, so the hook
 * would need each modal's open condition threaded up by hand. Several files
 * hold five modals, each with a different condition.
 *
 * This mounts *inside* the panel instead, so React's own lifecycle answers
 * "is it open" — the component exists exactly when the modal is on screen. It
 * finds its parent, applies the dialog semantics to it, and labels it from
 * the heading the modal already shows. One line per site, no markup moved, no
 * animation touched, and no new copy to translate.
 *
 *   <motion.div className="...unchanged...">
 *     <DialogBehaviour onClose={onClose} />
 */
export const DialogBehaviour: React.FC<{
  /**
   * Optional. Left off, Escape presses the dialog's own close control, which
   * is what the user would have clicked -- so the close path cannot drift
   * from the app's real one. Guessing a handler per site would be worse: one
   * of these panels has an Export PDF button where the close button usually
   * sits, and wiring Escape to that would export a file.
   */
  onClose?: () => void;
  closeOnEscape?: boolean;
}> = ({ onClose, closeOnEscape = true }) => {
  const marker = useRef<HTMLSpanElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const node = marker.current?.parentElement ?? null;
    if (!node) return;

    const id = Symbol("dialog");
    stack.push(id);
    const isTop = () => stack[stack.length - 1] === id;
    const restoreTo = document.activeElement as HTMLElement | null;

    // Semantics, unless the panel already declares its own.
    const had = {
      role: node.getAttribute("role"),
      modal: node.getAttribute("aria-modal"),
      tab: node.getAttribute("tabindex"),
      labelledby: node.getAttribute("aria-labelledby"),
    };
    if (!had.role) node.setAttribute("role", "dialog");
    if (!had.modal) node.setAttribute("aria-modal", "true");
    if (had.tab === null) node.setAttribute("tabindex", "-1");
    // Name it from its own visible heading rather than a new invented string.
    let mintedTitleId: string | null = null;
    if (!had.labelledby && !node.getAttribute("aria-label")) {
      const heading = node.querySelector("h1,h2,h3");
      if (heading) {
        if (!heading.id) {
          mintedTitleId = `dlg-title-${Math.random().toString(36).slice(2, 9)}`;
          heading.id = mintedTitleId;
        }
        node.setAttribute("aria-labelledby", heading.id);
      }
    }

    const unlock = lockScroll(node);
    const first = node.querySelector(FOCUSABLE) as HTMLElement | null;
    (first ?? node).focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (!isTop()) return;
      if (e.key === "Escape" && closeOnEscape) {
        e.stopPropagation();
        if (onCloseRef.current) {
          onCloseRef.current();
        } else {
          // Layered and deliberately conservative: an explicit Close label,
          // then a Cancel button, then an icon-only button carrying nothing
          // but a glyph. If none of those is present, Escape does nothing --
          // no worse than before, and never the wrong action.
          const byLabel = Array.from(
            node.querySelectorAll("button,[role='button']") as NodeListOf<HTMLElement>,
          );
          const close =
            byLabel.find((b) => /close|மூடு/i.test(b.getAttribute("aria-label") ?? "")) ??
            byLabel.find((b) => /^(cancel|ரத்து)$/i.test((b.textContent ?? "").trim())) ??
            byLabel.find(
              (b) => !(b.textContent ?? "").trim() && b.querySelector("svg") !== null,
            );
          close?.click();
        }
        return;
      }
      if (e.key !== "Tab") return;
      const items: HTMLElement[] = Array.from(
        node.querySelectorAll(FOCUSABLE) as NodeListOf<HTMLElement>,
      ).filter((el) => el.offsetWidth > 0 || el.offsetHeight > 0);
      if (!items.length) {
        e.preventDefault();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      const active = document.activeElement;
      if (!node.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? lastItem : firstItem).focus();
      } else if (e.shiftKey && active === firstItem) {
        e.preventDefault();
        lastItem.focus();
      } else if (!e.shiftKey && active === lastItem) {
        e.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      unlock();
      const i = stack.indexOf(id);
      if (i >= 0) stack.splice(i, 1);
      // Leave the panel as it was found, in case it is reused.
      if (!had.role) node.removeAttribute("role");
      if (!had.modal) node.removeAttribute("aria-modal");
      if (had.tab === null) node.removeAttribute("tabindex");
      if (!had.labelledby && mintedTitleId) node.removeAttribute("aria-labelledby");
      restoreTo?.focus({ preventScroll: true });
    };
  }, [closeOnEscape]);

  return <span ref={marker} hidden />;
};

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "../i18n";

/**
 * The guided tour on the public demo at sitetru.com/demo.
 *
 * A visitor who lands in a full project-management app with twelve tabs has no
 * idea which three matter. This walks them through those in order, spotlighting
 * the real interface rather than describing it.
 *
 * It is a demo-only component: the production bundle never includes it. Steps
 * address the app through `data-tour` attributes, so they survive copy edits
 * and work the same in Tamil, where matching on visible text would not.
 */

type Step = {
  /** `data-tour` value to spotlight. Omit for a centred card. */
  target?: string;
  /** Nav item to open before this step, as its `data-tour` suffix. */
  navTo?: string;
  /** i18n key stem; `.t` is the heading and `.b` the body. */
  k: string;
  /** Pad the cut-out; a tight box round a whole column looks like an error. */
  pad?: number;
};

const STEPS: Step[] = [
  { k: "demoTour.s1" },
  { k: "demoTour.s2", target: "nav", pad: 10 },
  { k: "demoTour.s3", navTo: "wbs", target: "content" },
  { k: "demoTour.s4", navTo: "dailylogs", target: "content" },
  { k: "demoTour.s5", navTo: "costs", target: "content" },
  { k: "demoTour.s6", target: "lang", pad: 8 },
];

const KEY = "sitetru.demo.tour.done";

type Rect = { top: number; left: number; width: number; height: number };

/**
 * The shell renders the nav twice -- once for the sidebar, once for the mobile
 * menu -- so a plain querySelector can return the hidden copy, which measures
 * zero and would put the spotlight in the corner. Take the first one actually
 * laid out.
 */
const visible = (selector: string): HTMLElement | null => {
  const all = Array.from(document.querySelectorAll<HTMLElement>(selector));
  return all.find((el) => el.getBoundingClientRect().width > 0) ?? null;
};

export const DemoTour: React.FC = () => {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const card = useRef<HTMLDivElement>(null);

  // Don't ambush a returning visitor with it again.
  //
  // The demo opens on the portfolio, where none of the targets exist yet --
  // they belong to the project view. So wait for a project to be opened rather
  // than starting over an empty page or opening one on the visitor's behalf.
  useEffect(() => {
    let seen = false;
    try {
      seen = localStorage.getItem(KEY) === "1";
    } catch {
      /* private mode: treat as unseen */
    }
    if (seen) return;

    let tries = 0;
    const id = setInterval(() => {
      if (visible('[data-tour="nav"]')) {
        clearInterval(id);
        setTimeout(() => setOpen(true), 900);   // let the view settle
      } else if (++tries > 240) {
        clearInterval(id);                      // ~2 min; they're not going in
      }
    }, 500);
    return () => clearInterval(id);
  }, []);

  const finish = useCallback(() => {
    setOpen(false);
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* nothing to do */
    }
  }, []);

  // Measure the current target. Re-measured on scroll and resize because the
  // spotlight is drawn in viewport coordinates.
  const measure = useCallback(() => {
    const s = STEPS[step];
    if (!s?.target) {
      setRect(null);
      return;
    }
    const el = visible(`[data-tour="${s.target}"]`);
    if (!el) {
      setRect(null);
      return;
    }
    const r = el.getBoundingClientRect();
    const pad = s.pad ?? 4;
    setRect({
      top: r.top - pad,
      left: r.left - pad,
      width: r.width + pad * 2,
      height: r.height + pad * 2,
    });
  }, [step]);

  // Navigate first, then let the new screen paint before measuring it.
  useEffect(() => {
    if (!open) return;
    const s = STEPS[step];
    let cancelled = false;

    const go = async () => {
      if (s?.navTo) {
        visible(`[data-tour="nav-${s.navTo}"]`)?.click();
        await new Promise((r) => setTimeout(r, 420));
      }
      if (!cancelled) measure();
    };
    void go();
    return () => {
      cancelled = true;
    };
  }, [open, step, measure]);

  useEffect(() => {
    if (!open) return;
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, measure]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      if (e.key === "ArrowRight" || e.key === "Enter") {
        setStep((n) => (n + 1 < STEPS.length ? n + 1 : (finish(), n)));
      }
      if (e.key === "ArrowLeft") setStep((n) => Math.max(0, n - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, finish]);

  if (!open) {
    return (
      <button
        onClick={() => {
          setStep(0);
          setOpen(true);
        }}
        className="fixed bottom-20 right-4 z-[190] px-3.5 py-2 rounded-full bg-white text-surface-dark border border-divider text-[11px] font-black uppercase tracking-widest shadow-lg hover:bg-panel apple-transition"
      >
        {t("demoTour.replay")}
      </button>
    );
  }

  const s = STEPS[step];
  const last = step === STEPS.length - 1;

  // A cut-out round something that fills the screen dims almost nothing and
  // reads as a rendering fault. Past that size, drop the cut-out and put the
  // card in a corner instead, so it never covers what it is describing.
  const big =
    !!rect &&
    (rect.width * rect.height) / (window.innerWidth * window.innerHeight) > 0.55;
  const spotlight = rect && !big ? rect : null;

  // Place the card under the cut-out, or above it when there is no room, and
  // keep it inside the viewport either way.
  const CARD_W = 380;
  const CARD_H = 240;   // enough for the tallest step's copy
  const GAP = 16;
  let cardStyle: React.CSSProperties = {
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
  };
  if (big) {
    // Bottom right, clear of the demo banner along the foot.
    cardStyle = { bottom: 88, right: GAP };
  } else if (spotlight) {
    const centred = Math.min(
      Math.max(GAP, spotlight.left + spotlight.width / 2 - CARD_W / 2),
      window.innerWidth - CARD_W - GAP,
    );
    const below = spotlight.top + spotlight.height + GAP;
    const above = spotlight.top - CARD_H - GAP;

    if (window.innerHeight - below > CARD_H) {
      cardStyle = { top: below, left: centred };
    } else if (above > GAP) {
      cardStyle = { top: above, left: centred };
    } else {
      // A tall target -- the nav column -- leaves room neither above nor
      // below, and stacking the card on it hides what it is pointing at.
      const toRight = spotlight.left + spotlight.width + GAP;
      const left =
        toRight + CARD_W <= window.innerWidth - GAP
          ? toRight
          : Math.max(GAP, spotlight.left - CARD_W - GAP);
      cardStyle = {
        top: Math.min(Math.max(GAP, spotlight.top), window.innerHeight - CARD_H - GAP),
        left,
      };
    }
  }

  return (
    <>
      {/* Swallows stray clicks so the tour cannot be half-dismissed. */}
      <div className="fixed inset-0 z-[180]" onClick={(e) => e.stopPropagation()} />

      {spotlight ? (
        <div
          aria-hidden="true"
          className="fixed z-[181] rounded-2xl pointer-events-none"
          style={{
            top: spotlight.top,
            left: spotlight.left,
            width: spotlight.width,
            height: spotlight.height,
            boxShadow: "0 0 0 9999px rgba(22,35,44,.66)",
            transition: "top .3s ease, left .3s ease, width .3s ease, height .3s ease",
          }}
        />
      ) : (
        <div
          className="fixed inset-0 z-[181] pointer-events-none"
          style={{ background: big ? "rgba(22,35,44,.28)" : "rgba(22,35,44,.66)" }}
        />
      )}

      <div
        ref={card}
        role="dialog"
        aria-modal="true"
        aria-label={t(`${s.k}.t`)}
        className="fixed z-[182] bg-white rounded-2xl shadow-2xl border border-divider p-5"
        style={{ ...cardStyle, width: CARD_W, maxWidth: "calc(100vw - 32px)" }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="text-[10px] font-black uppercase tracking-widest text-primary">
            {step + 1} / {STEPS.length}
          </span>
          <button
            onClick={finish}
            className="text-[11px] font-bold text-ink-muted hover:text-ink apple-transition"
          >
            {t("demoTour.skip")}
          </button>
        </div>

        <h3 className="text-lg font-black text-ink leading-tight">{t(`${s.k}.t`)}</h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-ink-muted">{t(`${s.k}.b`)}</p>

        <div className="mt-4 flex items-center gap-2">
          <div className="flex gap-1.5 flex-1">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1.5 rounded-full apple-transition ${
                  i === step ? "w-5 bg-primary" : "w-1.5 bg-divider"
                }`}
              />
            ))}
          </div>
          {step > 0 && (
            <button
              onClick={() => setStep(step - 1)}
              className="px-3 py-2 rounded-xl text-xs font-bold text-ink-muted hover:bg-panel apple-transition"
            >
              {t("demoTour.back")}
            </button>
          )}
          <button
            onClick={() => (last ? finish() : setStep(step + 1))}
            className="px-4 py-2 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-wider hover:bg-[#B85F3B] apple-transition"
          >
            {last ? t("demoTour.done") : t("demoTour.next")}
          </button>
        </div>
      </div>
    </>
  );
};

import React, { useEffect, useRef, useState } from "react";
import { Play } from "@phosphor-icons/react";
import {
  GUIDES, fmtLength, guideCaptions, guidePoster, guidePosterWebp, guideRendition, guideVideo,
  type Guide, type Rendition,
} from "../content/guides";

/** What the browser says about this screen and connection, at this moment. */
function viewing(el: HTMLElement | null) {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } };
  return {
    width: el?.clientWidth ?? window.innerWidth,
    devicePixelRatio: window.devicePixelRatio || 1,
    screenWidth: Math.max(window.screen?.width ?? 0, window.screen?.height ?? 0),
    fullscreen: !!document.fullscreenElement,
    saveData: nav.connection?.saveData,
    effectiveType: nav.connection?.effectiveType,
  };
}

/**
 * The module guides: one player, and the list of guides beside it.
 *
 * Same rule as HeroVideo: nothing of a video is fetched until someone presses
 * play. The visitor on a site with one bar of signal pays for one small poster
 * (WebP, sized to the screen), not for thirteen films. When play is pressed
 * the player picks the encode for this device (guideRendition): 480p on a
 * phone or a slow connection, 720p on a tablet or desktop, and 1080p once it
 * goes full screen on a large display, carrying on from the same second.
 * English captions are available from the player's CC button.
 *
 * Used on the landing page (before buying) and in the app's Help (after), so a
 * customer finds the same guides in both places.
 */
export const GuidesPlayer: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const [current, setCurrent] = useState<Guide>(GUIDES[0]);
  const [started, setStarted] = useState(false);
  const [rendition, setRendition] = useState<Rendition>(720);
  const frameRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Where a new encode starts, as a media fragment (#t=): set when stepping up
  // to 1080p in full screen, so the guide carries on from the same second.
  const [startAt, setStartAt] = useState(0);

  const play = (g: Guide) => {
    setStartAt(0);
    setRendition(guideRendition(viewing(frameRef.current)));
    setCurrent(g);
    setStarted(true);
    // On a phone the list sits under the player; bring the player back into
    // view so the tap visibly starts something.
    const frame = frameRef.current;
    if (frame && frame.getBoundingClientRect().top < 0) frame.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  // A new guide or a new encode: (re)load it and play. The <source> only
  // exists after the render, hence here.
  useEffect(() => {
    const v = videoRef.current;
    if (!started || !v) return;
    v.load();
    v.play().catch(() => {});
  }, [started, current.id, rendition]);

  // Full screen on a large display: step up to 1080p from the same second.
  // (iPhone full screen is the native player, which fires no such event and
  // keeps the phone encode, which is right for a phone.)
  useEffect(() => {
    const onFs = () => {
      const v = videoRef.current;
      if (!v || !document.fullscreenElement?.contains(v)) return;
      const want = guideRendition(viewing(frameRef.current));
      if (want > rendition) {
        setStartAt(Math.floor(v.currentTime * 10) / 10);
        setRendition(want);
      }
    };
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, [rendition]);

  const posterSizes = compact ? "(max-width: 600px) 100vw, 420px" : "(min-width: 1024px) 700px, 100vw";

  return (
    <div className={`grid gap-5 ${compact ? "" : "lg:grid-cols-[1.6fr_1fr]"}`}>
      <div>
        <div ref={frameRef} className="relative aspect-video rounded-2xl overflow-hidden bg-surface-dark shadow-xl scroll-mt-20">
          {started ? (
            <video
              ref={videoRef}
              key={current.id}
              className="w-full h-full"
              controls
              playsInline
              preload="none"
              poster={guidePoster(current.id)}
              aria-label={`Video guide: ${current.title}`}
            >
              <source src={guideVideo(current.id, rendition) + (startAt > 0 ? `#t=${startAt}` : "")} type="video/mp4" />
              <track kind="captions" src={guideCaptions(current.id)} srcLang="en" label="English" />
            </video>
          ) : (
            <button
              type="button"
              onClick={() => play(current)}
              className="group absolute inset-0 w-full h-full"
              aria-label={`Play the video guide: ${current.title}`}
            >
              <picture>
                <source
                  type="image/webp"
                  srcSet={`${guidePosterWebp(current.id, 640)} 640w, ${guidePosterWebp(current.id, 1280)} 1280w`}
                  sizes={posterSizes}
                />
                <img src={guidePoster(current.id)} alt="" width={1280} height={720} className="w-full h-full object-cover" loading="lazy" decoding="async" />
              </picture>
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-2xl group-hover:scale-105 transition-transform">
                  <Play weight="fill" className="w-6 h-6 sm:w-7 sm:h-7 ml-1" />
                </span>
              </span>
            </button>
          )}
        </div>
        <div className="mt-3">
          <h3 className="font-bold text-lg tracking-tight">{current.title}</h3>
          <p className="text-sm text-ink-muted">{current.description}</p>
        </div>
      </div>

      <ol
        className={`soft-card rounded-2xl p-2 ${compact ? "max-h-72 overflow-y-auto" : "md:grid md:grid-cols-2 md:gap-x-2 lg:block lg:max-h-[30rem] lg:overflow-y-auto"}`}
        aria-label="Video guides"
      >
        {GUIDES.map((g, i) => {
          const on = g.id === current.id;
          return (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => play(g)}
                aria-current={on ? "true" : undefined}
                className={`w-full min-h-11 text-left flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${on ? "bg-primary/10 text-primary-deep" : "hover:bg-primary/5"}`}
              >
                <span className={`w-7 h-7 shrink-0 rounded-full text-xs font-bold flex items-center justify-center ${on ? "bg-primary text-on-primary" : "bg-primary/10 text-primary"}`}>{i + 1}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold truncate">{g.title}</span>
                </span>
                {g.seconds > 0 && <span className="text-xs text-ink-muted tabular-nums">{fmtLength(g.seconds)}</span>}
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export default GuidesPlayer;

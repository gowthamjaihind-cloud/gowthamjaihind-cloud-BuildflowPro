import React, { useRef, useState } from "react";
import { Play } from "@phosphor-icons/react";

/**
 * The launch film on the landing page, as a poster the visitor opts into.
 *
 * NOT an autoplaying background loop, deliberately. The audience is contractors
 * and site engineers on Indian mobile data, often on a site with one bar, and
 * this page already ships ~471 KB of gzipped JS before anything renders. The
 * film is 3 MB -- six times the rest of the page -- so spending that on someone
 * who came to read the pricing would be the single most expensive thing here.
 *
 * So nothing of the video is fetched until it is asked for: `<source>` is not
 * rendered at all until the play button is pressed, which is stronger than
 * `preload="none"` (browsers still range-request metadata for a src they can
 * see). Until then the cost is the poster, at 47 KB.
 *
 * The film is also silent, which is why there is no mute control: the source
 * composition carries an empty audio track and nothing to hear.
 */
export const HeroVideo: React.FC<{ className?: string }> = ({ className = "" }) => {
  const [started, setStarted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const start = () => {
    setStarted(true);
    // The <source> only exists after this render, so load() has to wait for it.
    requestAnimationFrame(() => {
      videoRef.current?.load();
      // A user gesture started this, so play() is allowed -- but a rejected
      // promise here is unhandled otherwise, and the controls are visible
      // anyway, so a failure leaves the viewer able to press play themselves.
      videoRef.current?.play().catch(() => {});
    });
  };

  return (
    <div
      className={`relative overflow-hidden rounded-3xl border border-divider bg-surface-dark shadow-lg ${className}`}
      style={{ aspectRatio: "16 / 9" }}
    >
      <video
        ref={videoRef}
        poster="/media/sitetru-hero-poster.jpg"
        controls={started}
        playsInline
        preload="none"
        className="w-full h-full block"
        // Silent film; muted also keeps autoplay policies from blocking play().
        muted
      >
        {started && <source src="/media/sitetru-hero.mp4" type="video/mp4" />}
      </video>

      {!started && (
        <button
          type="button"
          onClick={start}
          aria-label="Play the Sitetru film, 83 seconds, no sound"
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-ink/35 hover:bg-ink/25 apple-transition focus:outline-none focus-visible:ring-4 focus-visible:ring-primary/40"
        >
          <span className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-white/95 text-surface-dark flex items-center justify-center shadow-xl">
            <Play weight="fill" className="w-7 h-7 md:w-9 md:h-9 translate-x-0.5" />
          </span>
          <span className="text-white text-xs font-bold uppercase tracking-widest drop-shadow">
            Watch · 83 seconds · no sound
          </span>
        </button>
      )}
    </div>
  );
};

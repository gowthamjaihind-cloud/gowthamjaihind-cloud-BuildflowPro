import React, { useRef, useState } from "react";
import { Play } from "@phosphor-icons/react";
import { GUIDES, fmtLength, guidePoster, guideVideo, type Guide } from "../content/guides";

/**
 * The module guides: one player, and the list of guides beside it.
 *
 * Same rule as HeroVideo: nothing of a video is fetched until someone presses
 * play. The visitor on a site with one bar of signal pays for one poster, not
 * for thirteen films. Choosing a guide from the list starts it, because that
 * click is the request.
 *
 * Used on the landing page (before buying) and in the app's Help (after), so a
 * customer finds the same guides in both places.
 */
export const GuidesPlayer: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const [current, setCurrent] = useState<Guide>(GUIDES[0]);
  const [started, setStarted] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const play = (g: Guide) => {
    setCurrent(g);
    setStarted(true);
    // The new <source> only exists after this render.
    requestAnimationFrame(() => {
      const v = videoRef.current;
      if (!v) return;
      v.load();
      v.play().catch(() => {});
    });
  };

  return (
    <div className={`grid gap-5 ${compact ? "" : "lg:grid-cols-[1.6fr_1fr]"}`}>
      <div>
        <div className="relative aspect-video rounded-2xl overflow-hidden bg-surface-dark shadow-xl">
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
              <source src={guideVideo(current.id)} type="video/mp4" />
            </video>
          ) : (
            <button
              type="button"
              onClick={() => play(current)}
              className="group absolute inset-0 w-full h-full"
              aria-label={`Play the video guide: ${current.title}`}
            >
              <img src={guidePoster(current.id)} alt="" className="w-full h-full object-cover" loading="lazy" />
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="w-16 h-16 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-2xl group-hover:scale-105 transition-transform">
                  <Play weight="fill" className="w-7 h-7 ml-1" />
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

      <ol className={`soft-card rounded-2xl p-2 overflow-y-auto ${compact ? "max-h-72" : "lg:max-h-[30rem]"}`} aria-label="Video guides">
        {GUIDES.map((g, i) => {
          const on = g.id === current.id;
          return (
            <li key={g.id}>
              <button
                type="button"
                onClick={() => play(g)}
                aria-current={on ? "true" : undefined}
                className={`w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${on ? "bg-primary/10 text-primary-deep" : "hover:bg-primary/5"}`}
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

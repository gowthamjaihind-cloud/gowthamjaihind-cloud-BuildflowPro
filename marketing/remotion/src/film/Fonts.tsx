import React from "react";
import { cancelRender, continueRender, delayRender, staticFile } from "remotion";
import { FONT } from "../theme";

/**
 * Load Manrope from disk, and hold the render until it is ready.
 *
 * The rest of this pipeline pulls webfonts from Google at render time, which
 * this environment cannot reach at all -- and even where it can, it is a
 * render-blocking third-party request that has stalled a page load here
 * before. Worse, it fails SILENTLY: the frame renders in whatever the fallback
 * stack resolves to, so a whole film comes out in the wrong typeface and
 * nothing reports an error. That is exactly what the first render of this film
 * did.
 *
 * `delayRender` is the part that makes this safe. Without it the first frames
 * are captured before the font has parsed, so a film opens in Helvetica and
 * switches to Manrope a second in.
 */
const FACE = `
@font-face {
  font-family: "Manrope";
  src: url("${staticFile("Manrope-var.woff2")}") format("woff2");
  font-weight: 200 800;
  font-display: block;
}
@font-face {
  font-family: "JetBrains Mono";
  src: url("${staticFile("JetBrainsMono-var.woff2")}") format("woff2");
  font-weight: 100 800;
  font-display: block;
}
`;

export const Fonts: React.FC = () => {
  const [handle] = React.useState(() => delayRender("loading Manrope"));

  React.useEffect(() => {
    const style = document.createElement("style");
    style.textContent = FACE;
    document.head.appendChild(style);
    // Ask for the weights actually used, not just the family: document.fonts
    // resolves immediately for a family it has not been asked to rasterise.
    Promise.all([
      document.fonts.load('800 80px "Manrope"'),
      document.fonts.load('700 20px "Manrope"'),
      document.fonts.load('500 28px "Manrope"'),
      document.fonts.load('600 20px "JetBrains Mono"'),
    ])
      .then(() => document.fonts.ready)
      .then(() => {
        if (!document.fonts.check('800 80px "Manrope"')) {
          throw new Error(
            "Manrope did not load. public/Manrope-var.woff2 must exist -- " +
              "without it the film renders in a fallback face and says nothing about it.",
          );
        }
        continueRender(handle);
      })
      .catch((e) => cancelRender(e));
  }, [handle]);

  return null;
};

/** Applied once at the top of a composition, so nothing has to repeat it. */
export const typeStyle: React.CSSProperties = {
  fontFamily: FONT,
  WebkitFontSmoothing: "antialiased",
  textRendering: "geometricPrecision",
};

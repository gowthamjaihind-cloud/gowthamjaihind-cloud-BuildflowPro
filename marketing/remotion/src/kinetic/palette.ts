import { C } from "../theme";

/**
 * The kinetic cut is set in the product's LIGHT theme.
 *
 * Which theme a film is captured in is not a styling preference, it is a
 * decision about luma. The launch film is dark because it opens and closes on
 * dark brand cards with white product screenshots in the middle, and the jump
 * between them measured 185 luma in two frames -- the single worst moment in
 * it. The same arithmetic is why this cut cannot be half and half: the
 * screenshots now average 208 luma against the dark set's 37, so a navy
 * opener in front of them would reproduce exactly that fault, 24 times.
 *
 * So everything the film draws itself -- opener, end card, captions, falloff
 * -- is defined here against the light ground, and nothing reaches for
 * `C.surfaceDark` or `C.primaryOnDark`. Those two are the dark-surface tokens:
 * `primaryOnDark` is a lifted cobalt that exists because the base fails at
 * 2.40:1 on navy, and putting it on an off-white page inverts the problem.
 *
 * The brand mark is the one thing that does not change. Its tile is 6.24:1 on
 * this page and 3.11:1 on the dark canvas, which is why BrandLogo.tsx draws it
 * once for both themes rather than keeping two versions.
 */
export const T = {
  /** The ground the film's own cards sit on. The app's page colour. */
  ground: C.page,
  /** Type on that ground. Near-navy ink, never pure black -- 17.85:1. */
  text: C.ink,
  /** Secondary type: the end card's address, the caption's rule. 6.07:1. */
  muted: C.inkMuted,
  /** Cobalt, at its base value: 6.70:1 on white, where primaryOnDark is 1.5:1. */
  accent: C.primary,

  /**
   * Falloff at the frame edge.
   *
   * `Vignette` paints black, so the strength that reads as "lit" on a dark
   * screenshot reads as "dirty" on a white one -- at 0.34 the corners of a
   * light frame visibly grey. Low enough here to stop a screenshot looking
   * pasted onto the frame, not low enough to be a mood.
   */
  vignette: 0.13,

  /** Grain. Finer on light, where noise in a white field is more visible. */
  grain: 0.02,

  /**
   * The caption scrim, as a radial gradient stop colour.
   *
   * On the dark cut this was near-black at 92% so white type could sit on a
   * bright screenshot. Inverted here: near-white, so INK type can sit on a
   * screenshot that may be any colour -- including the one genuinely dark
   * panel in the light theme, the Project Dashboard banner.
   */
  scrim: "250,251,253",
} as const;

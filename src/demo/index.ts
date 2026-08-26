// Dev-only demo mode: renders the real app against seeded fixtures so the
// product can be walked through — for a screen recording or a sales demo —
// without an account, a network connection, or any customer data.
//
// SAFETY — how this is kept out of production:
//
// Call sites test `import.meta.env.VITE_DEMO === "1"` INLINE, never through a
// helper. Vite substitutes that expression at build time, so a build without
// the flag compiles it to `false && …`; the branch is dead code, the fixture
// imports become unused, and Rollup drops the data entirely. A helper function
// would defeat this — the bundler cannot prove a call returns false, so the
// fixtures would ship. That is exactly what went wrong the first time.
//
// The deploy workflow never sets VITE_DEMO, so the shipped bundle contains no
// demo data at all. `npm run verify:no-demo` asserts that.

/** Runtime half of the gate: only the ?demo=1 query flag. */
export const demoRequested = (): boolean => {
  if (typeof window === "undefined") return false;
  try {
    return new URLSearchParams(window.location.search).has("demo");
  } catch {
    return false;
  }
};

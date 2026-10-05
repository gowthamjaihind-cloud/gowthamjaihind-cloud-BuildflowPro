/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

/** Compile-time demo-mode flag; see src/demo/index.ts. Never true in a deployed build. */
declare const __DEMO__: boolean;
/** True only in a VITE_USE_EMULATORS=1 build; see vite.config.ts `define`. */
declare const __EMULATORS__: boolean;

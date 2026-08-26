import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({mode}) => {
  return {
    plugins: [
      react(), 
      tailwindcss(),
      VitePWA({
        strategies: 'injectManifest',
        srcDir: 'src',
        filename: 'sw.ts',
        registerType: 'autoUpdate',
        injectManifest: {
          maximumFileSizeToCacheInBytes: 10 * 1024 * 1024
        },
        devOptions: {
          enabled: false,
          type: 'module',
        },
        manifest: {
          name: 'Sitetru',
          short_name: 'Sitetru',
          theme_color: '#324755',
          background_color: '#F0F3F4',
          display: 'standalone',
          icons: [
            {
              src: '/icon.svg',
              sizes: '512x512',
              type: 'image/svg+xml',
              purpose: 'any maskable'
            }
          ]
        }
      })
    ],
    // Strip noisy debug logs from the production bundle (keep error/warn until
    // an error tracker is wired in). The former GEMINI_API_KEY `define` was
    // removed: Gemini runs server-side via Secret Manager, and inlining a key
    // here would have baked a secret into the public client bundle.
    // __DEMO__ is a compile-time literal, so a build without VITE_DEMO=1
    // compiles every demo branch to `false && …`. The branches are dropped and
    // the fixture imports become unused, so no demo data reaches the bundle.
    // Relying on `import.meta.env.VITE_DEMO` alone does NOT achieve this: an
    // unset variable stays a runtime lookup that the bundler cannot fold.
    define: {
      __DEMO__: JSON.stringify(process.env.VITE_DEMO === "1"),
    },
    esbuild: {
      pure: mode === 'production' ? ['console.log', 'console.debug', 'console.info'] : [],
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        // Demo fixtures only enter the module graph for a demo build. Every
        // other build resolves "@demo" to an empty stub, so no fixture data can
        // reach production regardless of how the bundler treats dead branches.
        '@demo': path.resolve(
          __dirname,
          process.env.VITE_DEMO === '1' ? 'src/demo/demoData.ts' : 'src/demo/demoData.stub.ts',
        ),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
  };
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => {
  const basePath = mode === 'addon' ? './' : '/3Dash_webapp/';

  return {
    base: basePath,
    resolve: {
      dedupe: ['react', 'react-dom'],
    },
    plugins: [
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        // Use the existing manifest files in public/.
        manifest: false,
        workbox: {
          // Keep install-time caching light; 3D chunks are runtime-cached on demand.
          globPatterns: ['**/*.{js,css,html,svg,woff2}'],
          globIgnores: [
            '**/vendor-babylon-*.js',
            '**/Dashboard-*.js',
            '**/ConfigEditor-*.js',
          ],
          maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
          runtimeCaching: [
            {
              // Cache lazily loaded JS chunks after first use.
              urlPattern: /\/assets\/.*\.js$/,
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'js-chunk-cache',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 7 * 24 * 60 * 60,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              // Cache images/icons.
              urlPattern: /\.(?:png|jpg|jpeg|webp|ico)$/,
              handler: 'CacheFirst',
              options: {
                cacheName: 'image-cache',
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 30 * 24 * 60 * 60,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
          navigateFallback: `${basePath}index.html`,
        },
      }),
    ],
    build: {
      modulePreload: {
        resolveDependencies(_url, deps) {
          return deps.filter((dep) =>
            !dep.includes('vendor-babylon-') &&
            !dep.includes('Dashboard-') &&
            !dep.includes('ConfigEditor-')
          );
        },
      },
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/@babylonjs/')) {
              return 'vendor-babylon';
            }
            if (
              id.includes('node_modules/react/') ||
              id.includes('node_modules/react-dom/') ||
              id.includes('node_modules/react-router') ||
              id.includes('node_modules/scheduler/')
            ) {
              return 'vendor-react';
            }
          },
        },
      },
    },
    server: {
      host: true,
    },
  };
});

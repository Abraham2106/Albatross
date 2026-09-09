import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      react: resolve(root, 'node_modules/react'),
      'react-dom': resolve(root, 'node_modules/react-dom'),
    },
    dedupe: ['react', 'react-dom'],
  },
  plugins: [react(), {
    name: 'development-csp',
    transformIndexHtml(html, context) {
      // React Fast Refresh injects an inline preamble only in development.
      return context.server
        ? html.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
        : html;
    },
  }],
  server: { host: '127.0.0.1', port: 5187, strictPort: true },
});

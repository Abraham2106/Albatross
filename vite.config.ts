import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
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

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    // --host ya esta en el script, asi lo abris desde el celular
    // apuntando a la IP de la laptop. Eso es la demo movil sin Expo.
    proxy: {
      // Cuando el backend exista, esto evita problemas de CORS.
      '/api': { target: 'http://localhost:3000', changeOrigin: true }
    }
  }
});

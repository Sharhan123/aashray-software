import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    host: '0.0.0.0',
    allowedHosts: ['utilize-headfirst-retail.ngrok-free.dev'],
    proxy: { '/api': { target: 'http://127.0.0.1:4000' } },
  },
  test: { environment: 'jsdom', setupFiles: './src/test/setup.ts' },
});

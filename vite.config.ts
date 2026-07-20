import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // На этой машине IPv6-loopback (::1) не принимает соединения —
    // слушаем явно IPv4, чтобы localhost стабильно открывался.
    host: '127.0.0.1',
  },
});

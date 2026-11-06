import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: {
    port: 1420, strictPort: true,
    watch: { ignored: ['**/.tools/**', '**/src-tauri/target/**', '**/release/**', '**/.local-data/**'] },
  },
});

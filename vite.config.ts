import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { prerenderBlog } from './scripts/prerenderBlog';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), prerenderBlog()],
  optimizeDeps: {
    exclude: ['lucide-react', 'onnxruntime-web'],
  },
});

import { defineConfig } from 'vite';

// relative base so the built game also runs from a sub-folder (e.g. XAMPP /oyun/game/dist/)
export default defineConfig({
  base: './',
  server: { port: 5173 },
});

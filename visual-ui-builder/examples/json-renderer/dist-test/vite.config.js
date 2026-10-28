import { defineConfig } from 'vite';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = dirname(fileURLToPath(import.meta.url));
export default defineConfig({
    root: __dirname,
    build: {
        outDir: join(__dirname, 'dist'),
        sourcemap: true
    },
    server: {
        port: 5174,
        open: false
    }
});
//# sourceMappingURL=vite.config.js.map
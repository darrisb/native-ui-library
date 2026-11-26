import { defineConfig } from "vite";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const directory = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: directory,
  build: { outDir: join(directory, "dist"), sourcemap: true },
  server: { port: 5175, open: false },
});

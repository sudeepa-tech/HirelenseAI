import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
        configure(proxy) {
          proxy.on("error", (err, _req, res) => {
            if (res && !res.headersSent && res.writeHead) {
              res.writeHead(503, { "content-type": "application/json" });
              res.end(JSON.stringify({
                error: `Backend gateway (localhost:8080) is not reachable (${err.code || err.message}). The gateway service is not running — check the [gateway] lines in the terminal running "npm run dev", or run "node scripts/doctor.mjs" to diagnose.`
              }));
            }
          });
        }
      }
    }
  },
  worker: { format: "es" },
  optimizeDeps: { exclude: ["@huggingface/transformers"] },
  build: {
    outDir: "dist",
    sourcemap: false,
    target: "es2022",
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("@huggingface") || id.includes("onnxruntime")) return "asr";
        }
      }
    }
  }
});

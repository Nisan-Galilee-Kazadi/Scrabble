import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const serverPort = Number.parseInt(process.env.SCRABBLE_SERVER_PORT ?? "8788", 10);

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: "0.0.0.0",
    proxy: {
      "/api": {
        target: `http://127.0.0.1:${serverPort}`,
        changeOrigin: true
      },
      "/ws": {
        target: `ws://127.0.0.1:${serverPort}`,
        ws: true,
        changeOrigin: true
      }
    }
  },
});

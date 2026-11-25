import express from "express";
import path from "path";
import type { Server } from "node:http";
import { createServer as createViteServer } from "vite";
import app from "./server";

const SHUTDOWN_TIMEOUT_MS = 5000;
let httpServer: Server | null = null;
let shuttingDown = false;

function shutdown(reason: string, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[shutdown] Menerima ${reason}; menutup server...`);

  const forceExit = setTimeout(() => {
    console.error(`[shutdown] Server tidak berhenti dalam ${SHUTDOWN_TIMEOUT_MS}ms; keluar paksa.`);
    process.exit(exitCode || 1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  if (!httpServer) {
    clearTimeout(forceExit);
    process.exit(exitCode);
  }

  httpServer.close((error) => {
    clearTimeout(forceExit);
    if (error) {
      console.error(`[shutdown] Gagal menutup server: ${error.message}`);
      process.exit(1);
    }
    console.log("[shutdown] Server ditutup dengan rapi.");
    process.exit(exitCode);
  });
  httpServer.closeIdleConnections();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("uncaughtException", (error) => {
  console.error(`[fatal] uncaughtException: ${error instanceof Error ? error.message : String(error)}`);
  shutdown("uncaughtException", 1);
});
process.on("unhandledRejection", (reason) => {
  console.error(`[fatal] unhandledRejection: ${reason instanceof Error ? reason.message : String(reason)}`);
  shutdown("unhandledRejection", 1);
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    console.log("Starting server in DEVELOPMENT mode with Vite Middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting server in PRODUCTION mode...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const port = Number(process.env.PORT) || 3003;
  httpServer = app.listen(port, "0.0.0.0", () => {
    console.log(`Server KHARISMA running on: http://0.0.0.0:${port}`);
  });
}

startServer().catch((error) => {
  console.error(`[fatal] Gagal memulai server: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

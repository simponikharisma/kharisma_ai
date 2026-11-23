import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import app from "./server";

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
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const port = Number(process.env.PORT) || 3003;
  app.listen(port, "0.0.0.0", () => {
    console.log(`Server KHARISMA running on: http://0.0.0.0:${port}`);
  });
}

startServer();

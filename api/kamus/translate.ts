import type { Request, Response } from "express";
import app from "../../server.ts";

export default function translateHandler(req: Request, res: Response) {
  const requestUrl = req.url || "/";
  if (!requestUrl.startsWith("/api/") && requestUrl !== "/api") {
    req.url = `/api${requestUrl.startsWith("/") ? "" : "/"}${requestUrl}`;
  }

  return app(req, res);
}

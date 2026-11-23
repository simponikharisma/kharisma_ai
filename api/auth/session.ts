import type { Request, Response } from "express";
import app from "../../server.ts";

export default function sessionHandler(req: Request, res: Response) {
  req.url = "/api/auth/session";
  return app(req, res);
}

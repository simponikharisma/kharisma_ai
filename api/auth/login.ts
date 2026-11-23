import type { Request, Response } from "express";
import app from "../../server.ts";

export default function loginHandler(req: Request, res: Response) {
  req.url = "/api/auth/login";
  return app(req, res);
}

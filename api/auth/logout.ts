import type { Request, Response } from "express";
import app from "../../server.ts";

export default function logoutHandler(req: Request, res: Response) {
  req.url = "/api/auth/logout";
  return app(req, res);
}

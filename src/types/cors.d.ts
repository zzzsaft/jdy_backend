declare module "cors" {
  import type { RequestHandler } from "express";

  type CorsOptions = Record<string, unknown>;

  export default function cors(options?: CorsOptions): RequestHandler;
}

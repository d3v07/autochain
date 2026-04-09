import type { FastifyInstance } from "fastify";
import type { Db } from "@autochain/db";

declare module "fastify" {
  interface FastifyInstance {
    db: Db;
  }
}

export type App = FastifyInstance;

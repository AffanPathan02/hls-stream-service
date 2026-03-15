// db.ts
import fp from "fastify-plugin";
import postgres from "@fastify/postgres";
import type { FastifyInstance } from "fastify";

export const dbPlugin = fp(async (fastify: FastifyInstance) => {
  await fastify.register(postgres, {
    connectionString: `postgres://${process.env.DB_USER}:${process.env.DB_PASSWORD}@${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`,
  });
});

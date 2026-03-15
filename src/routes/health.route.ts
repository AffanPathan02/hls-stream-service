import type { FastifyInstance } from "fastify";

export async function healthRoutes(fastify: FastifyInstance) {
  fastify.get("/health", async (_, reply) => {
    const result = await fastify.pg.query("SELECT NOW() as time");

    return reply.send({
      status: "ok",
      service: "HLS Streaming Service",
      timestamp: result?.rows[0]?.time,
    });
  });
}

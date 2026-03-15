import { FastifyInstance } from "fastify";

export async function trackByIdRoutes(fastify: FastifyInstance) {
  fastify.get("/track/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const result = await fastify.pg.query(
      "SELECT track_id, song_name, artist_name, album_name, master_playlist_url, upload_date, duration_seconds FROM tracks WHERE track_id = $1",
      [id],
    );
    return reply.send(result.rows);
  });
}

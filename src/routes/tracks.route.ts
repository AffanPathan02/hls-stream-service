import { FastifyInstance } from "fastify";

export async function tracksRoutes(fastify: FastifyInstance) {
  fastify.get("/tracks", async (_, reply) => {
    const result = await fastify.pg.query(
      "SELECT track_id, song_name, artist_name, album_name, master_playlist_url, upload_date, duration_seconds FROM tracks ORDER BY upload_date DESC",
    );
    return reply.send(result.rows);
  });
}

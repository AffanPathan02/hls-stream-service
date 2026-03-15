import type { PostgresDb } from "@fastify/postgres";
import type { FastifyBaseLogger } from "fastify";

export interface TrackInsertData {
  trackId: string;
  songName: string;
  artistName: string;
  albumName: string | null;
  masterPlaylistUrl: string;
  durationSeconds: number | null;
  fileSizeBytes: number;
  totalSegments: number;
}

/**
 * Insert a new track row into the `tracks` table and return the created row.
 */
export async function storeTrackInDB(
  pg: PostgresDb,
  data: TrackInsertData,
  logger: FastifyBaseLogger,
) {
  const query = `
    INSERT INTO tracks (
      track_id,
      song_name,
      artist_name,
      album_name,
      master_playlist_url,
      duration_seconds,
      file_size_bytes,
      total_segments,
      upload_date
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, NOW()
    )
    RETURNING *
  `;

  const values = [
    data.trackId,
    data.songName,
    data.artistName,
    data.albumName,
    data.masterPlaylistUrl,
    data.durationSeconds,
    data.fileSizeBytes,
    data.totalSegments,
  ];

  const result = await pg.query(query, values);
  logger.info(`Stored in database: ${data.trackId}`);
  return result.rows[0];
}

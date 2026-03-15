import { FastifyInstance } from "fastify";
import path from "path";
import fs from "fs";
import { pipeline } from "stream/promises";
import { transcode } from "../core/transcode.js";
import type { TranscodeResult } from "../core/transcode.js";
import { uploadHLSToS3, S3_BUCKET, S3_REGION } from "../services/s3.service.js";
import { storeTrackInDB } from "../services/track.service.js";
import { deleteLocalOutput, removeTempFile } from "../utils/cleanup.js";

// ---------------------------------------------------------------------------
// Upload Route
// ---------------------------------------------------------------------------

export async function uploadRoutes(fastify: FastifyInstance) {
  fastify.post("/upload", async (request, reply) => {
    const data = await request.file();
    const trackId = crypto.randomUUID();
    const localOutputDir = path.join(process.cwd(), "output", trackId);

    if (!data) {
      return reply.code(400).send({ error: "No file uploaded" });
    }

    // Ensure uploads directory exists
    const uploadsDir = path.join(process.cwd(), "uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const tempFilePath = path.join(uploadsDir, data.filename);

    try {
      const pipelineStart = performance.now();

      // Save file to disk
      await pipeline(data.file, fs.createWriteStream(tempFilePath));

      // Check if file was truncated (exceeded size limit)
      if (data.file.truncated) {
        removeTempFile(tempFilePath);
        return reply
          .code(413)
          .send({ error: "File too large. Max upload size is 500 MB." });
      }

      const fileStats = fs.statSync(tempFilePath);

      // Read multipart fields for metadata
      const fields = data.fields;
      const songName =
        (fields.song_name && "value" in fields.song_name
          ? (fields.song_name.value as string)
          : null) || data.filename.replace(/\.[^.]+$/, "");
      const artistName =
        (fields.artist_name && "value" in fields.artist_name
          ? (fields.artist_name.value as string)
          : null) || "Unknown Artist";
      const albumName =
        fields.album_name && "value" in fields.album_name
          ? (fields.album_name.value as string)
          : null;

      request.log.info(
        {
          trackId,
          originalFile: data.filename,
          sizeMB: (fileStats.size / (1024 * 1024)).toFixed(2),
        },
        "NEW UPLOAD REQUEST",
      );

      // STEP 1: Transcode
      request.log.info("STEP 1: Transcoding...");
      const transcodeStart = performance.now();
      const transcodeResult: TranscodeResult = await transcode(
        tempFilePath,
        trackId,
        request.log,
      );
      const transcodeMs = performance.now() - transcodeStart;
      request.log.info(
        { transcodeTimeSeconds: (transcodeMs / 1000).toFixed(2) },
        "Transcoding complete",
      );

      const totalSegments = transcodeResult.bitrates.reduce(
        (sum, br) => sum + br.segments,
        0,
      );

      // STEP 2: Upload to S3
      request.log.info("STEP 2: Uploading to S3...");
      const s3Start = performance.now();
      const masterPlaylistUrl = await uploadHLSToS3(
        trackId,
        localOutputDir,
        request.log,
      );
      const s3Ms = performance.now() - s3Start;
      request.log.info(
        { s3UploadTimeSeconds: (s3Ms / 1000).toFixed(2), masterPlaylistUrl },
        "S3 upload complete",
      );

      // STEP 3: Store in database
      request.log.info("STEP 3: Storing in database...");
      await storeTrackInDB(
        fastify.pg,
        {
          trackId,
          songName,
          artistName,
          albumName,
          masterPlaylistUrl,
          durationSeconds: transcodeResult.audio_duration_seconds ?? null,
          fileSizeBytes: fileStats.size,
          totalSegments,
        },
        request.log,
      );

      // STEP 4: Cleanup
      request.log.info("STEP 4: Cleaning up...");
      removeTempFile(tempFilePath);
      deleteLocalOutput(trackId, request.log);
      request.log.info("Cleanup complete");

      // Response
      const totalMs = performance.now() - pipelineStart;
      request.log.info(
        {
          trackId,
          transcodeSeconds: +(transcodeMs / 1000).toFixed(2),
          s3UploadSeconds: +(s3Ms / 1000).toFixed(2),
          totalSeconds: +(totalMs / 1000).toFixed(2),
        },
        "UPLOAD COMPLETE",
      );

      return reply.send({
        success: true,
        trackId,
        songName,
        artistName,
        masterPlaylistUrl,
        bitrates: transcodeResult.bitrates.map((br) => ({
          bitrate: br.name,
          segments: br.segments,
          playlistUrl: `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/tracks/${trackId}/${br.name}/index.m3u8`,
        })),
        totalSegments,
        processingTime: (totalMs / 1000).toFixed(2) + "s",
        breakdown: {
          transcodeSeconds: +(transcodeMs / 1000).toFixed(2),
          s3UploadSeconds: +(s3Ms / 1000).toFixed(2),
        },
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      request.log.error({ err: error }, `Upload failed: ${msg}`);

      removeTempFile(tempFilePath);
      if (fs.existsSync(localOutputDir)) {
        fs.rmSync(localOutputDir, { recursive: true, force: true });
      }

      return reply.code(500).send({
        error: "Upload failed",
        message: msg,
      });
    }
  });
}

import fs from "fs";
import path from "path";
import type { FastifyBaseLogger } from "fastify";

/**
 * Delete the local HLS output directory for a given track.
 */
export function deleteLocalOutput(trackId: string, logger: FastifyBaseLogger) {
  const outputDir = path.join(process.cwd(), "output", trackId);
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
    logger.info(`Deleted local files: ${outputDir}`);
  }
}

/**
 * Safely remove a temp file if it exists.
 */
export function removeTempFile(filePath: string) {
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
  }
}

import fs from "fs";
import path from "path";
import mime from "mime-types";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import type { FastifyBaseLogger } from "fastify";

// ---------------------------------------------------------------------------
// S3 Configuration
// ---------------------------------------------------------------------------

const S3_BUCKET = process.env.S3_BUCKET || "sam-music-store-bucket";
const S3_REGION = process.env.AWS_REGION || "us-east-1";

const s3Client = new S3Client({
  region: S3_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY ?? "",
  },
});

if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
  // We'll keep console.warn here as it's a startup/env check, or we could use a global logger if available.
  // For now, just removing the emoji.
  console.warn(
    "\nWARNING: AWS credentials not set in environment variables!",
  );
  console.warn(
    "Please create a .env file with AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY\n",
  );
}

// ---------------------------------------------------------------------------
// Concurrency-limited batch runner
// ---------------------------------------------------------------------------

async function runWithConcurrency<T>(
  tasks: (() => Promise<T>)[],
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let idx = 0;

  async function worker() {
    while (idx < tasks.length) {
      const i = idx++;
      results[i] = await tasks[i]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () =>
    worker(),
  );
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// S3 Upload Helpers
// ---------------------------------------------------------------------------

/** Max S3 PUT requests in flight at once */
const S3_CONCURRENCY = 15;

export { S3_BUCKET, S3_REGION };

export async function uploadFileToS3(
  filePath: string,
  s3Key: string,
  logger?: FastifyBaseLogger,
): Promise<string> {
  const fileStream = fs.createReadStream(filePath);
  const contentType = mime.lookup(filePath) || "application/octet-stream";

  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: s3Key,
    Body: fileStream,
    ContentType: contentType,
    ACL: "public-read",
  });

  try {
    await s3Client.send(command);
    const s3Url = `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/${s3Key}`;
    if (logger) {
      logger.debug(`Uploaded: ${s3Key}`);
    }
    return s3Url;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    if (logger) {
      logger.error(`Failed to upload ${s3Key}: ${msg}`);
    }
    throw error;
  }
}

/**
 * Collect every file in the output tree, then upload them all concurrently.
 */
export async function uploadHLSToS3(
  trackId: string,
  localOutputDir: string,
  logger: FastifyBaseLogger,
): Promise<string> {
  logger.info(`Uploading to S3 (concurrency: ${S3_CONCURRENCY})...`);

  // 1) Collect all files (fast local I/O)
  const filesToUpload: { localPath: string; s3Key: string }[] = [];

  function collectFiles(dirPath: string, s3Prefix: string) {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const localPath = path.join(dirPath, entry.name);
      const s3Key = `tracks/${trackId}/${s3Prefix}${entry.name}`;
      if (entry.isDirectory()) {
        collectFiles(localPath, `${s3Prefix}${entry.name}/`);
      } else {
        filesToUpload.push({ localPath, s3Key });
      }
    }
  }

  collectFiles(localOutputDir, "");
  logger.info(`Found ${filesToUpload.length} files to upload`);

  // 2) Upload with bounded concurrency
  const start = performance.now();

  const tasks = filesToUpload.map(
    ({ localPath, s3Key }) => () => uploadFileToS3(localPath, s3Key, logger),
  );
  await runWithConcurrency(tasks, S3_CONCURRENCY);

  const elapsed = ((performance.now() - start) / 1000).toFixed(2);
  logger.info(`Uploaded ${filesToUpload.length} files to S3 in ${elapsed}s`);

  const masterUrl = `https://${S3_BUCKET}.s3.${S3_REGION}.amazonaws.com/tracks/${trackId}/master.m3u8`;
  return masterUrl;
}

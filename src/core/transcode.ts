import { spawn } from "child_process";
import path from "path";
import type { FastifyBaseLogger } from "fastify";

export interface BitrateInfo {
  name: string;
  segments: number;
}

export interface TranscodeResult {
  bitrates: BitrateInfo[];
  audio_duration_seconds: number;
  total_time_ms: number;
}

const TRANSCODER_BINARY =
  process.platform === "win32" ? "hls-transcoder.exe" : "hls-transcoder";
const TRANSCODER_PATH = path.join(
  process.cwd(),
  "target",
  "release",
  TRANSCODER_BINARY,
);

export async function transcode(
  inputFile: string,
  trackId: string,
  logger?: FastifyBaseLogger,
): Promise<TranscodeResult> {
  return new Promise<TranscodeResult>((resolve, reject) => {
    const transcoderProcess = spawn(TRANSCODER_PATH, [inputFile, trackId]);
    let stdout = "";
    let stderr = "";

    transcoderProcess.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    transcoderProcess.stderr.on("data", (data) => {
      const text = data.toString();
      stderr += text;
      if (logger) {
        logger.debug(`[RUST] ${text.trim()}`);
      }
    });

    transcoderProcess.on("close", (code) => {
      if (code === 0) {
        try {
          const result: TranscodeResult = JSON.parse(stdout);
          resolve(result);
        } catch (error: unknown) {
          const msg =
            error instanceof Error ? error.message : String(error);
          reject(
            new Error(
              `Failed to parse rust stdout as JSON: ${msg} \n Output: ${stdout}`,
            ),
          );
        }
      } else {
        reject(
          new Error(`Rust transcoder exited with code ${code}\n${stderr}`),
        );
      }
    });

    transcoderProcess.on("error", (err) => {
      reject(
        new Error(
          `Failed to start Rust transcoder: ${err.message}\nPath: ${TRANSCODER_PATH}`,
        ),
      );
    });
  });
}

// server.ts
import "dotenv/config";
import Fastify from "fastify";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import { dbPlugin } from "./db.js";
import { healthRoutes } from "./routes/health.route.js";
import { tracksRoutes } from "./routes/tracks.route.js";
import { trackByIdRoutes } from "./routes/trackById.route.js";
import { uploadRoutes } from "./routes/upload.route.js";

const fastify = Fastify({ logger: true });

await fastify.register(cors, {
  origin: process.env.CLIENT_ORIGIN
    ? process.env.CLIENT_ORIGIN.split(",")
    : [
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:5173",
      ],
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
});

await fastify.register(multipart, {
  limits: {
    fileSize: 500 * 1024 * 1024, // 500 MB 
  },
});

await fastify.register(rateLimit, {
  global: false,
  max: 100,
  timeWindow: "1 minute",
});

await fastify.register(dbPlugin); // ← db initialisation

await fastify.register(healthRoutes);
await fastify.register(tracksRoutes);
await fastify.register(trackByIdRoutes);
await fastify.register(uploadRoutes);

try {
  const port = Number(process.env.PORT) || 3000;
  await fastify.listen({ port, host: "0.0.0.0" });
} catch (error) {
  fastify.log.error(error);
  process.exit(1);
}

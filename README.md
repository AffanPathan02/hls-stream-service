# HLS Stream Service

A **Fastify**-based REST API that accepts audio/video file uploads, transcodes them into **HLS (HTTP Live Streaming)** segments using FFmpeg, stores the segments in **AWS S3**, and exposes endpoints to list and stream tracks.

---

## Project Overview

| Concern | Technology |
|---|---|
| HTTP Framework | [Fastify v5](https://fastify.dev/) |
| Language | TypeScript (ESM) |
| Database | PostgreSQL via `@fastify/postgres` |
| Object Storage | AWS S3 (`@aws-sdk/client-s3`) |
| Transcoding | FFmpeg (spawned as a child process) |
| File Uploads | `@fastify/multipart` (max 500 MB) |

The service accepts a raw file upload, transcodes it into HLS `.m3u8` + `.ts` segments locally, uploads the segments to S3, persists track metadata to PostgreSQL, and cleans up local temp files.

---

## Folder Structure

```
hls-stream-service/
├── src/
│   ├── server.ts              # Fastify app entry point – registers plugins & routes
│   ├── db.ts                  # Fastify plugin that initialises the PostgreSQL connection
│   │
│   ├── core/
│   │   └── transcode.ts       # FFmpeg wrapper – transcodes a file into HLS segments
│   │
│   ├── routes/
│   │   ├── health.route.ts    # GET /health
│   │   ├── tracks.route.ts    # GET /tracks  – list all tracks
│   │   ├── trackById.route.ts # GET /tracks/:id – fetch a single track
│   │   └── upload.route.ts    # POST /upload  – upload & transcode a file
│   │
│   ├── services/
│   │   ├── s3.service.ts      # S3 helpers (upload segments, generate presigned URLs)
│   │   └── track.service.ts   # PostgreSQL queries for track metadata
│   │
│   └── utils/
│       └── cleanup.ts         # Removes temporary local files after upload
│
├── uploads/                   # Temporary directory for raw uploaded files
├── output/                    # Temporary directory for transcoded HLS segments
├── target/                    # TypeScript build output (git-ignored)
├── .env                       # Environment variables (see setup below)
├── tsconfig.json
└── package.json
```

---

## Setup

### Prerequisites

- **Node.js** ≥ 18
- **pnpm** ≥ 10 (`npm i -g pnpm`)
- **FFmpeg** installed and available on `PATH`
- A running **PostgreSQL** instance
- An **AWS S3** bucket with appropriate IAM credentials

### 1. Clone & install dependencies

```bash
git clone <repo-url>
cd hls-stream-service
pnpm install
```

### 2. Configure environment variables

Copy the example below into a `.env` file at the project root and fill in your values:


### 3. Run in development

```bash
pnpm dev
```

The server starts on `http://localhost:3000` with hot-reload via `tsx watch`.

### 4. Build for production

```bash
pnpm build   # compiles TypeScript → target/
pnpm start   # runs the compiled output
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | Health check |
| `GET` | `/tracks` | List all tracks |
| `GET` | `/tracks/:id` | Get a track by ID |
| `POST` | `/upload` | Upload a file (multipart/form-data, field: `file`) |

### Example upload

```bash
curl -X POST http://localhost:3000/upload \
  -F "file=@/path/to/audio.mp3"
```

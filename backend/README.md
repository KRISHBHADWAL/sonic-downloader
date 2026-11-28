# Sonic Downloader API

## Requirements

- Node.js 22.12 or newer
- Python 3.9 or newer
- yt-dlp installed in the same Python environment selected by PYTHON_COMMAND

Install the backend dependencies and yt-dlp:

    cd backend
    npm ci
    python3 -m pip install --upgrade yt-dlp
    cp .env.example .env
    npm start

On Windows, set PYTHON_COMMAND=py (or the full path to Python). The API binds to 127.0.0.1 by default; set HOST=0.0.0.0 only when deliberately exposing it on a trusted network. Set CORS_ORIGIN to the exact frontend origin (default: http://localhost:5173).

## Endpoints

- POST /video-info accepts a URL and returns the title, duration, thumbnail, and curated format metadata.
- POST /download accepts a URL, resolution, and optional FPS, and streams `progress`, `complete`, or `failure` Server-Sent Events. Progress values come from yt-dlp output. The completion event includes a short-lived, single-use download URL.
- GET /download/:ticket streams the ticket's file as an attachment. Tickets expire after 10 minutes and are removed when used.
- GET /health returns status ok while the API is running.

## File delivery and storage

Files are written to DOWNLOAD_DIR (backend/downloads by default). The API only issues a ticket for an output file reported by yt-dlp after verifying the resolved file is inside that directory and is a regular file. The GET route verifies the path again before streaming.

The frontend displays live yt-dlp media-preparation progress while this endpoint runs; after completion it opens the ticket URL as a native browser download. The browser manages the final file-transfer display. Tickets are random, single-use, in-memory capabilities with a 10-minute expiry. They are not user authentication and are not shared across multiple backend instances. Files remain on the server after being sent; configure retention cleanup for deployments with persistent storage.

## Security

- User input is passed as process arguments with spawn(..., { shell: false }), never interpolated into a shell command.
- Source URLs are restricted to an exact platform hostname allowlist. This is not a complete SSRF defence: for public deployment, also validate DNS resolutions and enforce outbound network restrictions, including protection against redirects and platform-controlled media URLs.
- There is no credential or token flow for platform accounts. Do not store passwords, cookies, browser session exports, or tokens in source code, request bodies, or logs.
- Before public deployment, add user authentication, rate limiting, per-user quotas, download cleanup, and network egress controls.

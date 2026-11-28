# Sonic Downloader API

## Requirements

- Node.js 20.6 or newer
- Python 3.9 or newer
- yt-dlp installed in the same Python environment selected by PYTHON_COMMAND

Install the backend dependencies and yt-dlp:

    cd backend
    npm ci
    python3 -m pip install --upgrade yt-dlp
    cp .env.example .env
    npm start

On Windows, set PYTHON_COMMAND=py (or the full path to Python). The API binds to 127.0.0.1 by default; set HOST=0.0.0.0 only when deliberately exposing it on a trusted network. Set CORS_ORIGIN to the exact frontend origin.

## Endpoints

- POST /video-info accepts a URL and returns the title, duration, thumbnail, and curated format metadata.
- POST /download accepts a URL, resolution, and optional FPS. When yt-dlp completes, the API validates the output path and streams the file to the browser with Content-Disposition.
- GET /health returns status ok while the API is running.

## File delivery and storage

Files are written to DOWNLOAD_DIR (backend/downloads by default). The API only serves the exact output path reported by yt-dlp after verifying that the resolved file remains inside the configured directory and is a regular file. Files remain on the server after being sent; configure retention cleanup for deployments with persistent storage.

The API sends Content-Disposition, which the frontend reads to save the file using the server-provided filename. CORS exposes that header to the configured frontend origin.

## Security

- User input is passed as process arguments with spawn(..., { shell: false }), never interpolated into a shell command.
- Source URLs are restricted to an explicit platform hostname allowlist. This is not a complete SSRF defence: for public deployment, also validate DNS resolutions and enforce outbound network restrictions, including protection against redirects and platform-controlled media URLs.
- There is no credential or token flow. Do not store passwords, cookies, browser session exports, or tokens in source code, request bodies, or logs. Authenticated downloads are not implemented.
- Before public deployment, add authentication, rate limiting, per-user quotas, download cleanup, and network egress controls.

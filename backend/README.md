# Sonic Downloader API

## Requirements

- Node.js 20.6 or newer
- Python 3.9 or newer
- yt-dlp installed in the same Python environment selected by PYTHON_COMMAND

Install the backend dependencies and yt-dlp:

    cd backend
    npm ci
    python3 -m pip install --upgrade yt-dlp
    cp .env.example .env  # Windows PowerShell: Copy-Item .env.example .env
    npm start

On Windows, set PYTHON_COMMAND=py (or the full path to Python). The API binds to 127.0.0.1 by default; set HOST=0.0.0.0 only when deliberately exposing it on a trusted network. Set CORS_ORIGIN to the exact frontend origin.

Downloads are written temporarily to backend/downloads/ and the completed file is sent to the browser as an attachment. Files are not automatically deleted yet; configure retention/cleanup before public deployment.

## Endpoints

- POST /video-info accepts a URL and returns the title, duration, thumbnail, and curated format metadata.
- POST /download accepts a URL, resolution, and optional FPS. After yt-dlp completes, the API validates the output path and streams the file to the requesting browser. Live progress events are not implemented.
- GET /health returns status ok while the API is running.

## Security

- User input is passed as process arguments with spawn(..., { shell: false }), never interpolated into a shell command.
- Source URLs are restricted to an explicit platform hostname allowlist. This is not a complete SSRF defence: for public deployment, also validate DNS resolutions and enforce outbound network restrictions, including protection against redirects and platform-controlled media URLs.
- The output path is resolved and checked to ensure it remains inside the configured download directory before sending the file.
- There is no credential or token flow. Do not store passwords, cookies, browser session exports, or tokens in source code, request bodies, or logs. Authenticated downloads are not implemented.
- Before public deployment, add authentication, rate limiting, per-user quotas, download cleanup, and network egress controls.

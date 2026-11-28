# SONIC⚡Downloader

A React frontend with an Express API that uses yt-dlp to inspect and download publicly accessible media from supported platforms.

## Components

- **React UI — src/Downloader.js:** accepts a video URL, requests available formats on submission, and sends the selected quality to the API. It receives the completed file as a browser download.
- **Express API — backend/server.js:** validates input, restricts source hosts, starts yt-dlp without a shell, returns structured metadata, and streams the finished file to the requesting browser.
- **yt-dlp:** resolves platform metadata and media formats and performs the server-side download.

## Request flow

1. The user enters a URL and selects **Fetch video formats**.
2. The browser sends POST /video-info with the URL.
3. Express validates the URL protocol, exact hostname, length, credentials and port.
4. The backend invokes python -m yt_dlp --dump-single-json with spawn(..., { shell: false }).
5. The API returns curated video format metadata; the UI builds resolution and FPS options from that list.
6. The user selects quality and submits POST /download.
7. The backend validates the options, invokes yt-dlp with an explicit format selector, and captures the final output path.
8. Express verifies that the output file is inside the configured download directory and sends it to the browser as an attachment.

## Credentials and tokens

There is currently **no authentication or token flow**: no user accounts, OAuth, API keys, token refresh, or platform login are implemented. The public-media workflow does not require platform credentials. Do not put passwords, cookies, session exports, or access tokens in frontend code, request bodies, logs, or Git. Any future authenticated integration should use secure server-side secret storage, least-privilege access, and redacted logs.

## Requirements and setup

- Node.js 20.6+
- Python 3.9+
- yt-dlp installed in the Python environment used by the backend

Frontend (repository root):
    npm ci
    npm start

Backend (second terminal):
    cd backend
    npm ci
    python3 -m pip install --upgrade yt-dlp
    cp .env.example .env
    npm start

The API binds to 127.0.0.1:4000 by default and allows the frontend origin http://localhost:3000. See backend/README.md for configuration details.

## Known limitations and deployment notes

- Completed files are sent to the browser as downloads. Large files are buffered by the browser's Axios Blob response, so very large downloads may use substantial memory.
- Live byte-level download progress is not yet available.
- The backend is intended for local use. Before exposing it publicly, add authentication, rate limiting, per-user quotas, download cleanup, DNS/IP and redirect controls, and network-level outbound restrictions. An initial hostname allowlist alone does not fully eliminate SSRF risks in a media extractor.
- The frontend still uses Create React App, which React has deprecated. A Vite migration is recommended as a separate change after the current baseline is stable.
- Only download media you are authorised to save and comply with platform terms and applicable law.

# SONIC⚡Downloader

A React frontend with an Express API that uses yt-dlp to inspect and download publicly accessible media from supported platforms.

## Architecture

- **React UI — src/Downloader.js:** accepts a video URL, requests available formats when the user submits it, and sends the selected quality to the API.
- **Vite — vite.config.mjs:** runs the React development server, bundles production assets, and provides the Vitest test environment.
- **Express API — backend/server.js:** validates input, restricts source hosts, starts yt-dlp without a shell, returns structured metadata, and delivers completed files.
- **yt-dlp:** resolves platform metadata and media formats and performs the server-side download.

## Request flow

1. The user enters a URL and selects **Fetch video formats**.
2. The browser sends POST /video-info with the URL.
3. Express validates the URL protocol, host, length, credentials and port.
4. The backend invokes python -m yt_dlp --dump-single-json with spawn(..., { shell: false }).
5. The API returns curated video format metadata; the UI builds resolution and FPS options from that list.
6. The user selects quality and submits POST /download.
7. The backend validates the options and invokes yt-dlp with an explicit format selector.
8. yt-dlp saves the completed file under backend/downloads. Express validates the file path, creates a short-lived single-use ticket, and returns a download URL.
9. The browser navigates to that URL and receives the file as an attachment. The browser streams it natively rather than buffering the entire file in JavaScript.

## Credentials and tokens

There is no platform authentication flow: no user accounts, OAuth, API keys, platform login, or platform token refresh are implemented. The public-media workflow does not require platform credentials.

The API creates a short-lived, single-use random download ticket after a file has completed. This ticket authorises delivery of that one output file; it is not a platform credential or a reusable user session. Treat download URLs as private until they expire. Do not put passwords, cookies, session exports, or platform access tokens in frontend code, request bodies, logs, or Git.

## Requirements and setup

- Node.js 22.12+
- Python 3.9+
- yt-dlp installed in the Python environment used by the backend

Frontend (repository root):

    npm ci
    npm start

Vite serves the UI at http://127.0.0.1:5173 by default.

Backend (second terminal):

    cd backend
    npm ci
    python3 -m pip install --upgrade yt-dlp
    cp .env.example .env
    npm start

The API binds to 127.0.0.1:4000 by default and allows the Vite origin http://localhost:5173. Configure CORS_ORIGIN if your frontend uses another origin. Set VITE_API_BASE_URL if your backend is not at http://127.0.0.1:4000.

## Commands

- npm start — run the frontend development server.
- npm test — run the Vitest test suite once.
- npm run build — create the production build in dist/.
- npm run preview — preview the production build locally.

## Known limitations and deployment notes

- Files are streamed to the requesting browser after yt-dlp completes. The server retains its own copy under backend/downloads; configure scheduled retention cleanup for long-running deployments.
- Download tickets are in-memory, short-lived and single-use. They are intended for this local application, not a multi-instance production service.
- The UI indicates when the backend is preparing the file; it does not yet show yt-dlp byte-level progress.
- The backend is intended for local use. Before exposing it publicly, add authentication, rate limiting, per-user quotas, download cleanup, DNS/IP and redirect controls, and network-level outbound restrictions. An initial hostname allowlist alone does not fully eliminate SSRF risks in a media extractor.
- Only download media you are authorised to save and comply with platform terms and applicable law.

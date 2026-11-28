# Sonic Downloader API

## Requirements

- Node.js 22.12 or newer
- Python 3.9 or newer
- yt-dlp installed in the same Python environment selected by `PYTHON_COMMAND`

Install the backend dependencies and yt-dlp:

    cd backend
    npm ci
    python3 -m pip install --upgrade yt-dlp
    cp .env.example .env
    npm start

On Windows, set `PYTHON_COMMAND=py` (or the full path to Python). The API binds to `127.0.0.1` by default; set `HOST=0.0.0.0` only when deliberately exposing it on a trusted network. Set `CORS_ORIGIN` to the exact frontend origin (default: `http://127.0.0.1:5173`).

## Endpoints

- `POST /video-info` accepts a supported video URL and returns the title, duration, thumbnail, and curated video format metadata.
- `POST /download` accepts a video URL, resolution, and optional FPS, and streams `progress`, `complete`, or `failure` Server-Sent Events.
- `POST /music-info` accepts an individual SoundCloud track URL and returns title, artist, artwork, duration, and whether SoundCloud exposed the original `download` format.
- `POST /music-download` accepts an individual SoundCloud track URL and requests only the exact yt-dlp format ID `download`. It does not fall back to HLS or any stream format.
- `GET /download/:ticket` streams a completed file as an attachment. Tickets expire after 10 minutes and are removed when used.
- `GET /health` returns status `ok` while the API is running.

## SoundCloud music mode

SoundCloud's download flow requires the listener to be signed in, and the uploader must enable downloads for the individual track. SoundCloud does not offer whole-playlist downloads. See [SoundCloud's download guidance](https://help.soundcloud.com/hc/en-us/articles/115003448787-Downloading-tracks).

The app checks yt-dlp's extracted metadata for the original SoundCloud `download` format. The music download endpoint then explicitly requests `--format download`; it never selects a regular audio stream, HLS stream, or playlist as a substitute. When the original format is unavailable, the UI marks the track as stream-only and disables the download button.

### Optional signed-in session

For tracks whose original download endpoint requires a signed-in listener, you may configure your own SoundCloud session cookie file:

1. Obtain a Netscape-format cookie file for your own signed-in SoundCloud account using a trusted local method.
2. Store it inside the local `backend/` folder or another private location accessible to the backend.
3. Set `SOUNDCLOUD_COOKIES_FILE=./soundcloud-cookies.txt` in `backend/.env` (relative paths resolve from the backend directory).
4. Restart the backend.

The option is unset by default. The cookie file is never accepted from a browser request and its contents are not logged. Cookie files grant access to your account: treat them like passwords, do not share them, do not commit them, and keep the local file protected. The repository's `.gitignore` excludes the suggested cookie filenames.

## File delivery and storage

Files are written to `DOWNLOAD_DIR` (backend/downloads by default). The API only issues a ticket for an output file reported by yt-dlp after verifying the resolved file is inside that directory and is a regular file. The GET route verifies the path again before streaming.

The frontend displays live yt-dlp media-preparation progress while either download endpoint runs; after completion it opens the ticket URL as a native browser download. The browser manages the final file-transfer display. Tickets are random, single-use, in-memory capabilities with a 10-minute expiry. They are not user authentication and are not shared across multiple backend instances. Files remain on the server after being sent; configure retention cleanup for deployments with persistent storage.

## Security

- User input is passed as process arguments with `spawn(..., { shell: false })`, never interpolated into a shell command.
- Video and SoundCloud URLs are checked against separate exact hostname allowlists. The SoundCloud validator accepts individual track paths and rejects playlist/profile paths.
- The SoundCloud download command requests only the original download format. It must not be changed to fall back to regular stream formats.
- Output paths are resolved and checked to ensure the delivered file is a regular file inside the configured download directory.
- The optional cookie file is a local secret. Keep it outside version control and do not expose the backend publicly while it is configured.
- This is not a complete SSRF defence: for public deployment, also validate DNS resolutions and enforce outbound network restrictions, including protection against redirects and platform-controlled media URLs.
- Before public deployment, add user authentication, rate limiting, per-user quotas, download cleanup, and network egress controls.

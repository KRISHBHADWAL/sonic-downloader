<!--
  SONIC Downloader · project README
  The animated, custom-lettered wordmark is stored locally in assets/.
-->

<p align="center">
  <a href="https://github.com/KRISHBHADWAL/sonic-downloader">
    <img src="./assets/sonic-banner.gif" alt="SONIC Downloader — animated neon wordmark" width="900" />
  </a>
</p>

<p align="center">
  <strong>A sleek, local-first media downloader with a neon edge.</strong>
  <br />
  Switch between video downloads and SoundCloud music originals, inspect available formats, and follow the download pipeline in real time.
</p>

<p align="center">
  <a href="https://github.com/KRISHBHADWAL/sonic-downloader/actions/workflows/ci.yml">
    <img src="https://github.com/KRISHBHADWAL/sonic-downloader/actions/workflows/ci.yml/badge.svg?branch=master" alt="CI status" />
  </a>
  <img src="https://img.shields.io/badge/Node.js-22.12%2B-43853D?logo=node.js&logoColor=white" alt="Node.js 22.12 or newer" />
  <img src="https://img.shields.io/badge/React-18-20232A?logo=react&logoColor=61DAFB" alt="React 18" />
  <img src="https://img.shields.io/badge/Vite-8.4-646CFF?logo=vite&logoColor=white" alt="Vite 8.4" />
  <img src="https://img.shields.io/badge/Powered_by-yt--dlp-9B59B6" alt="Powered by yt-dlp" />
</p>

<p align="center">
  <a href="#-features">Features</a> ·
  <a href="#-quick-start">Quick start</a> ·
  <a href="#-how-it-works">How it works</a> ·
  <a href="#-api-reference">API</a> ·
  <a href="#-security--limitations">Security</a>
</p>

---

## ⚡ Features

| | Capability | What it does |
|:--:|---|---|
| ◈ | **Format discovery** | Fetches video metadata and available download formats before you commit to a quality. |
| ♫ | **SoundCloud music mode** | Finds individual tracks, shows artwork and metadata, and offers the original file only when SoundCloud exposes its download format. |
| ⬡ | **Quality controls** | Choose a resolution and available frame rate from the formats returned by yt-dlp. |
| ▰ | **Live progress** | Streams yt-dlp progress events to the neon progress bar using Server-Sent Events. |
| ↓ | **Native downloads** | Delivers completed files through the browser's download manager instead of buffering the whole file in the UI. |
| ⛨ | **Safer execution** | Uses shell-free process execution, a source-host allowlist, output-path checks, and short-lived single-use download tickets. |
| ◉ | **Local-first setup** | Runs the React interface and Express API on your own machine, with optional local SoundCloud session cookies for signed-in downloads. |

**Video sources:** YouTube, Instagram, and Snapchat. **Music source:** individual SoundCloud tracks. Platform availability and permissions apply.

## ✨ Interface

The app uses a dark cyberpunk visual system with a switchable **VIDEO / MUSIC** control. Video mode keeps resolution and FPS controls; SoundCloud mode adds track artwork, artist/title metadata, permission status, and an original-file download action. Its progress bar reflects yt-dlp preparation while the browser manages the final transfer.

SoundCloud mode accepts individual tracks only. It requests yt-dlp's exact `download` format and never falls back to HLS or streaming formats. A track without an original downloadable file is shown as stream-only and cannot be downloaded. SoundCloud requires listeners to be signed in and the uploader to enable downloads; playlists are not downloadable as a whole ([SoundCloud download guidance](https://help.soundcloud.com/hc/en-us/articles/115003448787-Downloading-tracks)).

> [!NOTE]
> The progress bar tracks the backend media download. Once the file is ready, the browser takes over the final transfer and displays its own download progress.

## 🧭 How it works

```mermaid
flowchart TD
    A["Choose a mode"] --> B["React + Vite interface"]
    B --> C{"Video or SoundCloud?"}
    C -->|Video| D["POST /video-info"]
    D --> E["Choose resolution and FPS"]
    E --> F["POST /download"]
    C -->|Music| G["POST /music-info"]
    G --> H["Check original download permission"]
    H --> I["POST /music-download — exact download format"]
    F --> J["Verify output file and issue one-use ticket"]
    I --> J
    J --> K["Browser downloads the file"]
    F -. "Live progress" .-> B
    I -. "Live progress" .-> B
```

### Request lifecycle

**Video:** `POST /video-info` validates the source and returns formats. Choose a resolution/FPS, then `POST /download` streams progress events while yt-dlp prepares the file.

**SoundCloud music:** `POST /music-info` resolves one track and checks whether SoundCloud exposes the original `download` format. `POST /music-download` requests only that exact format; if it is unavailable, the job fails instead of capturing a stream.

Both paths use the same output-path verification, 10-minute single-use ticket, and native browser delivery pipeline.

## 🧰 Tech stack

| Layer | Technology | Role |
|---|---|---|
| Frontend | React 18 | Interactive downloader interface |
| Build tooling | Vite | Development server and production bundling |
| Frontend tests | Vitest + Testing Library | UI smoke tests |
| Backend | Node.js + Express | Validation, process orchestration, and file delivery |
| Media engine | yt-dlp | Metadata extraction and media downloads |
| Backend tests | Node.js test runner | API helper and validation tests |

## 🚀 Quick start

### Prerequisites

- **Node.js 22.12 or newer**
- **Python 3.9 or newer**
- **pip** and a working Python installation
- Internet access for supported public media sources

### 1. Start the frontend

From the repository root:

```bash
npm ci
npm start
```

The Vite development server starts at **http://127.0.0.1:5173**.

### 2. Start the backend

Open a second terminal:

```bash
cd backend
npm ci
python3 -m pip install --upgrade yt-dlp
cp .env.example .env
npm start
```

The API starts at **http://127.0.0.1:4000**.

Open the frontend, paste a supported URL, select **Analyse link**, choose a quality, and start the download.

<details>
<summary><strong>Windows PowerShell setup</strong></summary>

Run the frontend commands from the repository root as shown above.

For the backend:

```powershell
cd backend
npm ci
py -m pip install --upgrade yt-dlp
Copy-Item .env.example .env
```

Open `backend/.env` and set:

```dotenv
PYTHON_COMMAND=py
```

Then start the API:

```powershell
npm start
```

</details>

## ⚙️ Configuration

The defaults are suitable for local development. Change them only when your environment requires it.

### Frontend — root `.env`

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `http://127.0.0.1:4000` | Backend API origin used by the browser |

### Backend — `backend/.env`

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4000` | API port |
| `HOST` | `127.0.0.1` | Bind address |
| `CORS_ORIGIN` | `http://127.0.0.1:5173` | Exact allowed frontend origin |
| `PYTHON_COMMAND` | `python3` (or `py` on Windows) | Python executable used to launch yt-dlp |
| `DOWNLOAD_DIR` | `./downloads` | Backend download storage directory |
| `YTDLP_TIMEOUT_MS` | `600000` | Maximum media operation duration |
| `ALLOWED_VIDEO_HOSTS` | Hosts listed in `backend/.env.example` | Comma-separated video source-host allowlist |
| `SOUNDCLOUD_COOKIES_FILE` | Unset | Optional path, relative to `backend/`, to your own signed-in SoundCloud cookies in Netscape format. Required only when SoundCloud's original-download endpoint needs your login. |

Keep the frontend and backend origins aligned. For example, if the frontend is served from `http://localhost:5173`, set `CORS_ORIGIN=http://localhost:5173` in the backend environment.

## 🔌 API reference

| Method | Endpoint | Purpose |
|:--:|---|---|
| `GET` | `/health` | Returns API health status. |
| `POST` | `/video-info` | Accepts a video URL and returns the title, duration, thumbnail, and curated formats. |
| `POST` | `/download` | Accepts a video URL, resolution, and optional FPS; streams progress, completion, or failure events. |
| `POST` | `/music-info` | Accepts one SoundCloud track URL and returns metadata plus original-download availability. |
| `POST` | `/music-download` | Requests only SoundCloud's original `download` format and streams progress, completion, or failure events. |
| `GET` | `/download/:ticket` | Streams the completed file as a browser attachment using a single-use ticket. |

### Download event stream

Both `POST /download` and `POST /music-download` return Server-Sent Events:

- `progress` — contains the reported percentage and current stage.
- `complete` — contains the temporary `downloadUrl`, filename, and expiry.
- `failure` — contains a safe error message.

Example request body:

```json
{
  "url": "https://www.youtube.com/watch?v=VIDEO_ID",
  "resolution": "1080",
  "fps": null
}
```

The completion event returns a relative download URL. The frontend resolves it against the configured API origin and checks that it stays on that same origin before opening it.

## 🧪 Development

Run the frontend checks from the repository root:

```bash
npm test
npm run build
```

Run backend tests from the `backend` directory:

```bash
npm test
```

Useful frontend commands:

| Command | Description |
|---|---|
| `npm start` | Start the Vite development server |
| `npm run dev` | Alias for the Vite development server |
| `npm test` | Run the Vitest suite once |
| `npm run build` | Create the production build in `dist/` |
| `npm run preview` | Preview the production build locally |

## 🛡️ Security & limitations

- yt-dlp is launched with `spawn(..., { shell: false })`; user-provided URLs are not interpolated into a shell command.
- Source URLs are checked against an exact hostname allowlist.
- Output paths are resolved and checked to ensure the delivered file is a regular file inside the configured download directory.
- Download tickets are random, single-use, expire after **10 minutes**, and do not reveal filesystem paths.
- SoundCloud authentication is optional and local-only: `SOUNDCLOUD_COOKIES_FILE` may point to a Netscape-format cookie file from your own signed-in account. Treat that file like a password, keep it outside version control, and never upload it to the app or share it. No OAuth flow is built into the UI.
- Music mode only selects SoundCloud's original `download` format. Streaming/HLS formats are never accepted as a fallback, and playlist URLs are rejected.
- SoundCloud track downloads require the uploader to have enabled downloads and a signed-in listener; a track may remain stream-only. Respect the creator's permissions and applicable terms.
- Tickets are held in memory and are intended for a single backend instance. Restarting the API invalidates outstanding tickets.
- Downloaded files remain on the backend after delivery. Configure retention cleanup for long-running installations.

> [!WARNING]
 > This project is intended for local use. A hostname allowlist alone is not a complete SSRF defence. Before exposing the API publicly, add authentication, rate limiting, per-user quotas, DNS/IP and redirect validation, network-level egress restrictions, persistent ticket handling, and download cleanup. Review platform terms and only save media you are authorised to download.

## 📁 Project layout

```text
sonic-downloader/
├── src/
│   ├── App.jsx
│   ├── App.test.jsx
│   ├── Downloader.jsx
│   ├── Downloader.css
│   ├── index.css
│   └── index.jsx
├── backend/
│   ├── server.js
│   ├── server.test.js
│   ├── .env.example
│   └── README.md
├── .github/
│   └── workflows/
│       └── ci.yml
├── index.html
├── package.json
├── vite.config.mjs
└── README.md
```

---

<p align="center">
  <strong>SONIC ⚡ DOWNLOADER</strong>
  <br />
  <sub>Built for speed. Designed for the dark.</sub>
  <br /><br />
  <a href="https://github.com/KRISHBHADWAL/sonic-downloader">Repository</a> ·
  <a href="https://github.com/KRISHBHADWAL/sonic-downloader/issues">Report an issue</a>
</p>

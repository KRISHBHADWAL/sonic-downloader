

```markdown
# SONIC⚡Downloader

SONIC⚡Downloader is a web application for downloading videos from various platforms using React for the frontend and Express.js with `yt-dlp` for backend operations. This application dynamically fetches video resolutions and FPS options based on the video URL provided.

## Features
- Fetch video resolutions and FPS options dynamically.
- Supports multiple platforms (YouTube, Instagram, Snapchat).
- Displays download progress.

## Prerequisites
- Node.js and npm
- `yt-dlp` installed (Install via `pip`):
  ```bash
  pip install yt-dlp
  ```

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/KRISHBHADWAL/sonic-downloader.git
   cd sonic-downloader
   ```

2. Install the required dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   node server.js
   ```

4. Start the frontend:
   ```bash
   npm start
   ```

## Usage

1. Open the application in your browser at `http://localhost:3000`.

2. Select the platform, enter the video URL, and wait for the video information to be fetched.

3. Choose the desired resolution and FPS, then click "Download" to start the download process.

## Project Structure

- `server.js`: The Express.js server that handles video information fetching and downloading using `yt-dlp`.
- `Downloader.js`: The React component that forms the frontend interface, allowing users to input video URLs, select resolutions and FPS options, and initiate downloads.

## API Endpoints

### POST /download
- Request Body:
  ```json
  {
    "url": "<video_url>",
    "platform": "<platform>",
    "resolution": "<resolution>",
    "fps": "<fps>"
  }
  ```
- Response:
  - `200 OK` on success.
  - `500 Internal Server Error` on failure.

### POST /video-info
- Request Body:
  ```json
  {
    "url": "<video_url>"
  }
  ```
- Response:
  - `200 OK` with video resolutions and FPS options.
  - `500 Internal Server Error` on failure.

## License
This project is licensed under the MIT License.
```

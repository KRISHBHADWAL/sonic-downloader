import React, { useState } from 'react';
import axios from 'axios';
import './Downloader.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:4000';

async function errorMessage(error) {
  const payload = error && error.response && error.response.data;
  if (payload && typeof payload === 'object' && payload.error) return payload.error;
  if (error && typeof error.message === 'string' && error.message !== 'Failed to fetch') return error.message;
  return 'The request failed. Check the URL and backend service.';
}

function openDownload(downloadUrl) {
  const target = new URL(downloadUrl, API_BASE_URL);
  if (target.origin !== new URL(API_BASE_URL).origin) {
    throw new Error('The API returned an invalid download location.');
  }

  const anchor = document.createElement('a');
  anchor.href = target.toString();
  anchor.rel = 'noopener';
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function formatDuration(seconds) {
  if (!Number.isFinite(Number(seconds)) || Number(seconds) < 0) return null;
  const total = Math.floor(Number(seconds));
  const minutes = Math.floor(total / 60);
  const remainder = String(total % 60).padStart(2, '0');
  return minutes + ':' + remainder;
}

async function readDownloadEvents(response, onProgress) {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || 'The backend could not prepare this download.');
  }
  if (!response.body || typeof response.body.getReader !== 'function') {
    throw new Error('This browser cannot read the live download progress stream.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let result = null;
  let failure = null;

  function handleFrame(frame) {
    const lines = frame.split(/\r?\n/);
    const eventLine = lines.find(line => line.startsWith('event:'));
    const data = lines.filter(line => line.startsWith('data:'))
      .map(line => line.slice(5).trim())
      .join('\n');
    if (!eventLine || !data) return;

    let payload;
    try {
      payload = JSON.parse(data);
    } catch {
      return;
    }

    const eventName = eventLine.slice(6).trim();
    if (eventName === 'progress') {
      onProgress(payload);
    } else if (eventName === 'complete') {
      result = payload;
    } else if (eventName === 'failure') {
      failure = new Error(payload.error || 'The media download failed.');
    }
  }

  try {
    while (!result && !failure) {
      const chunk = await reader.read();
      if (chunk.value) buffer += decoder.decode(chunk.value, { stream: !chunk.done });
      if (chunk.done) buffer += decoder.decode();

      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() || '';
      for (const frame of frames) {
        handleFrame(frame);
        if (result || failure) break;
      }

      if (chunk.done) {
        if (!result && !failure && buffer.trim()) handleFrame(buffer);
        break;
      }
    }
  } finally {
    reader.releaseLock();
  }

  if (failure) throw failure;
  if (!result) throw new Error('The progress stream ended before the file was ready.');
  return result;
}

const Downloader = () => {
  const [mode, setMode] = useState('video');
  const [url, setUrl] = useState('');
  const [resolution, setResolution] = useState('');
  const [fps, setFps] = useState('Any');
  const [formats, setFormats] = useState([]);
  const [videoTitle, setVideoTitle] = useState('');
  const [musicInfo, setMusicInfo] = useState(null);
  const [message, setMessage] = useState('');
  const [variant, setVariant] = useState('info');
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [loadingDownload, setLoadingDownload] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStage, setDownloadStage] = useState('');
  const [showProgress, setShowProgress] = useState(false);
  const [downloadComplete, setDownloadComplete] = useState(false);

  const resetResults = () => {
    setFormats([]);
    setResolution('');
    setVideoTitle('');
    setMusicInfo(null);
    setMessage('');
    setShowProgress(false);
    setDownloadComplete(false);
    setDownloadProgress(0);
    setDownloadStage('');
  };

  const changeMode = nextMode => {
    if (mode === nextMode || loadingInfo || loadingDownload) return;
    setMode(nextMode);
    setUrl('');
    resetResults();
  };

  const updateUrl = value => {
    setUrl(value);
    resetResults();
  };

  const fetchMediaInfo = async event => {
    event.preventDefault();
    if (!url.trim()) {
      setVariant('warning');
      setMessage(mode === 'music' ? 'Paste an individual SoundCloud track URL first.' : 'Enter a video URL first.');
      return;
    }

    setLoadingInfo(true);
    setFormats([]);
    setResolution('');
    setMusicInfo(null);
    setDownloadProgress(0);
    setShowProgress(false);
    setDownloadComplete(false);
    setMessage('');

    try {
      const endpoint = mode === 'music' ? '/music-info' : '/video-info';
      const response = await axios.post(API_BASE_URL + endpoint, { url: url.trim() }, { timeout: 120000 });

      if (mode === 'music') {
        setMusicInfo(response.data);
        if (response.data.downloadAvailable) {
          const extension = response.data.originalFormat && response.data.originalFormat.ext;
          setVariant('success');
          setMessage('Original track download is available.' + (extension ? ' Source format: ' + extension.toUpperCase() + '.' : ''));
        } else {
          setVariant('warning');
          setMessage('Track found, but SoundCloud is not offering an original download for it. The uploader may have downloads disabled, or you may need to sign in.');
        }
        return;
      }

      const nextFormats = Array.isArray(response.data.formats)
        ? response.data.formats.filter(item => Number(item.height) <= 4320)
        : [];
      if (!nextFormats.length) {
        setVariant('warning');
        setMessage('No downloadable video formats were found for this URL.');
        return;
      }

      setFormats(nextFormats);
      setVideoTitle(response.data.title || 'Video ready');
      const heights = [...new Set(nextFormats.map(item => String(item.height)))]
        .sort((a, b) => Number(b) - Number(a));
      setResolution(heights[0] || '');
      setVariant('success');
      setMessage('Video information loaded. Choose a quality and start the download.');
    } catch (error) {
      setVariant('danger');
      setMessage(await errorMessage(error));
    } finally {
      setLoadingInfo(false);
    }
  };

  const resolutions = [...new Set(formats.map(item => String(item.height)))]
    .sort((a, b) => Number(b) - Number(a));
  const fpsOptions = [...new Set(formats
    .filter(item => String(item.height) === resolution && item.fps)
    .map(item => Number(item.fps))
    .filter(Number.isFinite)
  )].sort((a, b) => b - a);

  const startDownload = async event => {
    event.preventDefault();
    if (mode === 'video' && (!url.trim() || !resolution)) {
      setVariant('warning');
      setMessage('Fetch video information and select a resolution first.');
      return;
    }
    if (mode === 'music' && (!url.trim() || !musicInfo || !musicInfo.downloadAvailable)) {
      setVariant('warning');
      setMessage('An original SoundCloud download must be available before you can save this track.');
      return;
    }

    setLoadingDownload(true);
    setShowProgress(true);
    setDownloadComplete(false);
    setDownloadProgress(0);
    setDownloadStage(mode === 'music' ? 'Checking original download permission' : 'Connecting to platform');
    setVariant('info');
    setMessage(mode === 'music' ? 'Preparing the original SoundCloud file...' : 'Your download session is starting...');

    try {
      const endpoint = mode === 'music' ? '/music-download' : '/download';
      const payload = mode === 'music'
        ? { url: url.trim() }
        : { url: url.trim(), resolution, fps: fps === 'Any' ? null : fps };
      const response = await fetch(API_BASE_URL + endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream'
        },
        body: JSON.stringify(payload)
      });

      const result = await readDownloadEvents(response, progress => {
        if (Number.isFinite(Number(progress.percent))) {
          setDownloadProgress(Math.round(Math.max(0, Math.min(100, Number(progress.percent)))));
        }
        if (progress.stage) setDownloadStage(progress.stage);
      });

      if (!result || typeof result.downloadUrl !== 'string') {
        throw new Error('The backend did not return a download link.');
      }

      openDownload(result.downloadUrl);
      setDownloadProgress(100);
      setDownloadStage('File ready — browser download started');
      setDownloadComplete(true);
      setVariant('success');
      setMessage('Your file is ready. Check your browser download manager for the transfer.');
    } catch (error) {
      setVariant('danger');
      setDownloadStage('Download preparation failed');
      setMessage(await errorMessage(error));
    } finally {
      setLoadingDownload(false);
    }
  };

  const isMusic = mode === 'music';

  return (
    <div className="sonic-app">
      <div className="ambient ambient--cyan" aria-hidden="true" />
      <div className="ambient ambient--violet" aria-hidden="true" />

      <header className="topbar">
        <a className="brand" href="/" aria-label="Sonic Downloader home">
          <span className="brand-mark">S<span>⚡</span></span>
          <span className="brand-copy">
            <strong>SONIC<span>DOWNLOADER</span></strong>
            <small>MEDIA EXTRACTION SYSTEM</small>
          </span>
        </a>
        <div className="system-status"><span className="status-dot" /> LOCAL NODE <span className="status-divider">/</span> ONLINE</div>
      </header>

      <main className="page-content">
        <section className="hero">
          <div className="eyebrow"><span className="eyebrow-line" /> ONE TOOL. TWO MODES. <span className="eyebrow-index">SYS // 001</span></div>
          <h1>MOVE AT THE SPEED<br /><span>OF SONIC.</span></h1>
          <p className="hero-copy">Video when you need it. SoundCloud music when you feel it.<br className="desktop-break" /> One workspace, tuned for the digital night.</p>
        </section>

        <section className="download-panel" aria-label="Sonic Downloader">
          <div className="panel-header">
            <div><span className="panel-kicker">01 / SOURCE INPUT</span><h2>{isMusic ? 'Find your sound' : 'Start your download'}</h2></div>
            <span className="panel-chip"><span /> {isMusic ? 'SOUNDCLOUD MODE' : 'VIDEO MODE'}</span>
          </div>

          <div className="mode-switch-wrap">
            <div className="mode-switch" role="tablist" aria-label="Choose media mode">
              <button
                className={'mode-option' + (!isMusic ? ' mode-option--active mode-option--video' : '')}
                type="button"
                role="tab"
                aria-selected={!isMusic}
                onClick={() => changeMode('video')}
                disabled={loadingInfo || loadingDownload}
              >
                <span className="mode-icon" aria-hidden="true">▶</span>
                <span><strong>VIDEO</strong><small>YT · INSTA · SNAP</small></span>
              </button>
              <button
                className={'mode-option' + (isMusic ? ' mode-option--active mode-option--music' : '')}
                type="button"
                role="tab"
                aria-selected={isMusic}
                onClick={() => changeMode('music')}
                disabled={loadingInfo || loadingDownload}
              >
                <span className="mode-icon" aria-hidden="true">♫</span>
                <span><strong>MUSIC</strong><small>SOUNDCLOUD</small></span>
              </button>
            </div>
            <span className="mode-caption">{isMusic ? 'ORIGINAL TRACK FILES' : 'VIDEO FORMAT CONTROL'}</span>
          </div>

          <form onSubmit={fetchMediaInfo} className="source-form">
            <label htmlFor="media-url">{isMusic ? 'SOUNDCLOUD TRACK URL' : 'VIDEO SOURCE URL'}</label>
            <div className="url-row">
              <span className="url-prefix" aria-hidden="true">↗</span>
              <input
                id="media-url"
                type="url"
                value={url}
                onChange={event => updateUrl(event.target.value)}
                placeholder={isMusic ? 'https://soundcloud.com/artist/track' : 'https://youtube.com/watch?v=...'}
                maxLength={2048}
                autoComplete="url"
                required
              />
              <button className="neon-button neon-button--primary" type="submit" disabled={loadingInfo || loadingDownload}>
                {loadingInfo ? <><span className="button-spinner" /> SCANNING</> : isMusic ? 'SCAN TRACK ↗' : 'ANALYSE LINK ↗'}
              </button>
            </div>
            <p className="field-hint">{isMusic
              ? 'INDIVIDUAL SOUNDCLOUD TRACKS · ORIGINAL DOWNLOADS ONLY'
              : 'SUPPORTED SOURCES: YOUTUBE · INSTAGRAM · SNAPCHAT'}</p>
          </form>

          {message && <div className={'notice notice--' + variant} role="status">{message}</div>}

          {isMusic && musicInfo && (
            <section className="music-result" aria-label="SoundCloud track information">
              <div className="section-divider"><span>02 / TRACK INTELLIGENCE</span><span className={musicInfo.downloadAvailable ? 'ready-indicator' : 'restricted-indicator'}>{musicInfo.downloadAvailable ? 'ORIGINAL FILE READY' : 'DOWNLOAD NOT ENABLED'}</span></div>
              <div className="track-card">
                {musicInfo.thumbnail
                  ? <img className="track-artwork" src={musicInfo.thumbnail} alt="" loading="lazy" />
                  : <div className="track-artwork track-artwork--placeholder" aria-hidden="true">♫</div>}
                <div className="track-details">
                  <span className="track-overline">SOUNDCLOUD / SINGLE TRACK</span>
                  <h3>{musicInfo.title}</h3>
                  <p>{musicInfo.artist}</p>
                  <div className="track-meta">
                    {formatDuration(musicInfo.duration) && <span>{formatDuration(musicInfo.duration)}</span>}
                    {musicInfo.originalFormat && musicInfo.originalFormat.ext && <span>{musicInfo.originalFormat.ext.toUpperCase()} ORIGINAL</span>}
                    {musicInfo.originalFormat && musicInfo.originalFormat.filesize && <span>{(musicInfo.originalFormat.filesize / (1024 * 1024)).toFixed(1)} MB</span>}
                  </div>
                  <a className="soundcloud-link" href={musicInfo.permalink || url} target="_blank" rel="noreferrer">OPEN ON SOUNDCLOUD ↗</a>
                </div>
                <div className={'track-permission' + (musicInfo.downloadAvailable ? ' track-permission--yes' : '')} aria-label={musicInfo.downloadAvailable ? 'Download permitted' : 'Download not available'}>
                  <span>{musicInfo.downloadAvailable ? '✓' : '×'}</span>
                  <small>{musicInfo.downloadAvailable ? 'DOWNLOAD\nAVAILABLE' : 'STREAM\nONLY'}</small>
                </div>
              </div>
              <div className="music-action-row">
                <div className="music-policy-note">Only SoundCloud's original downloadable file is offered. No stream capture or playlist ripping.</div>
                <button
                  className="neon-button neon-button--music"
                  type="button"
                  onClick={startDownload}
                  disabled={!musicInfo.downloadAvailable || loadingDownload || loadingInfo}
                >
                  {loadingDownload ? <><span className="button-spinner" /> PREPARING</> : <><span aria-hidden="true">↓</span> DOWNLOAD ORIGINAL</>}
                </button>
              </div>
            </section>
          )}

          {!isMusic && formats.length > 0 && (
            <form className="quality-form" onSubmit={startDownload}>
              <div className="section-divider"><span>02 / OUTPUT CONFIGURATION</span><span className="ready-indicator">FORMATS READY</span></div>
              <div className="video-title">{videoTitle}</div>
              <div className="quality-grid">
                <div className="input-block">
                  <label htmlFor="resolution">VIDEO QUALITY</label>
                  <select id="resolution" value={resolution} onChange={event => { setResolution(event.target.value); setFps('Any'); }}>
                    {resolutions.map(item => <option key={item} value={item}>{item}p</option>)}
                  </select>
                </div>
                <div className="input-block">
                  <label htmlFor="fps">FRAME RATE</label>
                  <select id="fps" value={fps} onChange={event => setFps(event.target.value)}>
                    <option value="Any">Any available</option>
                    {fpsOptions.map(item => <option key={item} value={item + 'fps'}>{item} FPS or lower</option>)}
                  </select>
                </div>
                <button className="neon-button neon-button--download" type="submit" disabled={loadingDownload || loadingInfo || !resolution}>
                  {loadingDownload ? <><span className="button-spinner" /> PREPARING</> : <><span aria-hidden="true">↓</span> DOWNLOAD VIDEO</>}
                </button>
              </div>
            </form>
          )}

          {showProgress && (
            <section className={'progress-panel' + (downloadComplete ? ' progress-panel--complete' : '')} aria-label="Download progress">
              <div className="progress-topline">
                <div><span className="panel-kicker">03 / DOWNLOAD PIPELINE</span><h3>{loadingDownload ? (isMusic ? 'Preparing your track' : 'Preparing your media') : downloadComplete ? 'Ready to roll' : 'Download status'}</h3></div>
                <strong className="progress-value">{downloadProgress}<span>%</span></strong>
              </div>
              <div
                className="sonic-progress"
                role="progressbar"
                aria-label="Media download preparation progress"
                aria-valuemin="0"
                aria-valuemax="100"
                aria-valuenow={downloadProgress}
              >
                <span className="sonic-progress-fill" style={{ width: downloadProgress + '%' }} />
                <span className="sonic-progress-sheen" aria-hidden="true" />
              </div>
              <div className="progress-caption">
                <span className="progress-pulse" />
                <span>{downloadStage || 'Waiting for media engine'}</span>
                <span className="progress-live">{loadingDownload ? 'LIVE' : downloadComplete ? 'COMPLETE' : 'IDLE'}</span>
              </div>
              <p className="progress-footnote">Live yt-dlp preparation progress. Your browser manages the final file transfer.</p>
            </section>
          )}
        </section>

        <div className="trust-row">
          <span><i>✦</i> FORMAT CONTROL</span>
          <span><i>◈</i> ORIGINAL DOWNLOADS</span>
          <span><i>⌁</i> LOCAL FILE DELIVERY</span>
        </div>
      </main>

      <footer className="page-footer">
        <span>SONIC⚡DOWNLOADER</span>
        <span>ONLY SAVE MEDIA YOU ARE AUTHORISED TO DOWNLOAD</span>
      </footer>
    </div>
  );
};

export default Downloader;

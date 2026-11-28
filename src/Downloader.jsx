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
  const [url, setUrl] = useState('');
  const [resolution, setResolution] = useState('');
  const [fps, setFps] = useState('Any');
  const [formats, setFormats] = useState([]);
  const [videoTitle, setVideoTitle] = useState('');
  const [message, setMessage] = useState('');
  const [variant, setVariant] = useState('info');
  const [loadingInfo, setLoadingInfo] = useState(false);
  const [loadingDownload, setLoadingDownload] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [downloadStage, setDownloadStage] = useState('');
  const [showProgress, setShowProgress] = useState(false);
  const [downloadComplete, setDownloadComplete] = useState(false);

  const fetchVideoInfo = async event => {
    event.preventDefault();
    if (!url.trim()) {
      setVariant('warning');
      setMessage('Enter a video URL first.');
      return;
    }

    setLoadingInfo(true);
    setFormats([]);
    setResolution('');
    setDownloadProgress(0);
    setShowProgress(false);
    setDownloadComplete(false);
    setMessage('');
    try {
      const response = await axios.post(API_BASE_URL + '/video-info', { url: url.trim() }, { timeout: 120000 });
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
    if (!url.trim() || !resolution) {
      setVariant('warning');
      setMessage('Fetch video information and select a resolution first.');
      return;
    }

    setLoadingDownload(true);
    setShowProgress(true);
    setDownloadComplete(false);
    setDownloadProgress(0);
    setDownloadStage('Connecting to platform');
    setVariant('info');
    setMessage('Your download session is starting...');
    try {
      const response = await fetch(API_BASE_URL + '/download', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'text/event-stream'
        },
        body: JSON.stringify({
          url: url.trim(),
          resolution,
          fps: fps === 'Any' ? null : fps
        })
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

  const updateUrl = value => {
    setUrl(value);
    setFormats([]);
    setResolution('');
    setVideoTitle('');
    setMessage('');
    setShowProgress(false);
    setDownloadComplete(false);
    setDownloadProgress(0);
  };

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
          <div className="eyebrow"><span className="eyebrow-line" /> NEXT-GEN MEDIA TOOLKIT <span className="eyebrow-index">SYS // 001</span></div>
          <h1>MOVE AT THE SPEED<br /><span>OF SONIC.</span></h1>
          <p className="hero-copy">Drop a link. Pick your quality. Get your media.<br className="desktop-break" /> Fast, focused, and built for the digital night.</p>
        </section>

        <section className="download-panel" aria-label="Sonic Downloader">
          <div className="panel-header">
            <div><span className="panel-kicker">01 / SOURCE INPUT</span><h2>Start your download</h2></div>
            <span className="panel-chip"><span /> SECURE LOCAL SESSION</span>
          </div>

          <form onSubmit={fetchVideoInfo} className="source-form">
            <label htmlFor="video-url">VIDEO SOURCE URL</label>
            <div className="url-row">
              <span className="url-prefix" aria-hidden="true">↗</span>
              <input
                id="video-url"
                type="url"
                value={url}
                onChange={event => updateUrl(event.target.value)}
                placeholder="https://youtube.com/watch?v=..."
                maxLength={2048}
                autoComplete="url"
                required
              />
              <button className="neon-button neon-button--primary" type="submit" disabled={loadingInfo || loadingDownload}>
                {loadingInfo ? <><span className="button-spinner" /> ANALYSING</> : 'ANALYSE LINK ↗'}
              </button>
            </div>
            <p className="field-hint">SUPPORTED SOURCES: YOUTUBE · INSTAGRAM · SNAPCHAT</p>
          </form>

          {message && <div className={'notice notice--' + variant} role="status">{message}</div>}

          {formats.length > 0 && (
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
                  {loadingDownload ? <><span className="button-spinner" /> PREPARING</> : <><span aria-hidden="true">↓</span> DOWNLOAD NOW</>}
                </button>
              </div>
            </form>
          )}

          {showProgress && (
            <section className={'progress-panel' + (downloadComplete ? ' progress-panel--complete' : '')} aria-label="Download progress">
              <div className="progress-topline">
                <div><span className="panel-kicker">03 / DOWNLOAD PIPELINE</span><h3>{loadingDownload ? 'Preparing your media' : downloadComplete ? 'Ready to roll' : 'Download status'}</h3></div>
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
          <span><i>✦</i> QUALITY CONTROL</span>
          <span><i>◈</i> NATIVE BROWSER DOWNLOADS</span>
          <span><i>⌁</i> NO ACCOUNT REQUIRED</span>
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

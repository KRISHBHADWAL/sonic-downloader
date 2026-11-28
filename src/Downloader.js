import React, { useState } from 'react';
import axios from 'axios';
import { Container, Form, Button, Alert, Spinner } from 'react-bootstrap';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:4000';

async function errorMessage(error) {
  const payload = error.response && error.response.data;
  if (payload && typeof payload === 'object' && payload.error) return payload.error;
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
      const heights = [...new Set(nextFormats.map(item => String(item.height)))].sort((a, b) => Number(b) - Number(a));
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

  const resolutions = [...new Set(formats.map(item => String(item.height)))].sort((a, b) => Number(b) - Number(a));
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
    setMessage('Preparing your download...');
    try {
      const response = await axios.post(API_BASE_URL + '/download', {
        url: url.trim(),
        resolution,
        fps: fps === 'Any' ? null : fps
      }, { timeout: 10 * 60 * 1000 });

      if (!response.data || typeof response.data.downloadUrl !== 'string') {
        throw new Error('The backend did not return a download link.');
      }
      openDownload(response.data.downloadUrl);
      setVariant('success');
      setMessage('Your file is ready. Your browser is downloading it now.');
    } catch (error) {
      setVariant('danger');
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
  };

  return (
    <Container className="mt-5">
      <h1>SONIC⚡Downloader</h1>
      <p className="text-muted">Fetch video formats and download media you are authorised to save.</p>
      {message && <Alert variant={variant} role="status">{message}</Alert>}

      <Form onSubmit={fetchVideoInfo}>
        <Form.Group className="mb-3" controlId="url">
          <Form.Label>Video URL</Form.Label>
          <Form.Control type="url" value={url} onChange={event => updateUrl(event.target.value)}
            placeholder="https://..." maxLength={2048} required />
        </Form.Group>
        <Button type="submit" disabled={loadingInfo || loadingDownload}>
          {loadingInfo ? <><Spinner as="span" size="sm" animation="border" className="me-2" />Fetching formats...</> : 'Fetch video formats'}
        </Button>
      </Form>

      {formats.length > 0 && (
        <Form className="mt-4" onSubmit={startDownload}>
          <h2 className="h5">{videoTitle}</h2>
          <Form.Group className="mb-3" controlId="resolution">
            <Form.Label>Video quality</Form.Label>
            <Form.Select value={resolution} onChange={event => { setResolution(event.target.value); setFps('Any'); }}>
              {resolutions.map(item => <option key={item} value={item}>{item}p</option>)}
            </Form.Select>
          </Form.Group>
          <Form.Group className="mb-3" controlId="fps">
            <Form.Label>Frame rate</Form.Label>
            <Form.Select value={fps} onChange={event => setFps(event.target.value)}>
              <option value="Any">Any available</option>
              {fpsOptions.map(item => <option key={item} value={item + 'fps'}>{item} FPS or lower</option>)}
            </Form.Select>
          </Form.Group>
          <Button type="submit" disabled={loadingDownload || loadingInfo || !resolution}>
            {loadingDownload ? <><Spinner as="span" size="sm" animation="border" className="me-2" />Downloading and preparing file...</> : 'Download'}
          </Button>
          <p className="small text-muted mt-2 mb-0">
            Once ready, your browser receives the file directly using its native download handling.
          </p>
        </Form>
      )}
    </Container>
  );
};

export default Downloader;

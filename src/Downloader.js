import React, { useState } from 'react';
import axios from 'axios';
import { Container, Form, Button, Alert, Spinner } from 'react-bootstrap';

const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'http://127.0.0.1:4000';

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
      const nextFormats = Array.isArray(response.data.formats) ? response.data.formats.filter(item => Number(item.height) <= 4320) : [];
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
      setMessage((error.response && error.response.data && error.response.data.error) ||
        'Could not fetch video information. Check the URL and backend service.');
    } finally {
      setLoadingInfo(false);
    }
  };

  const resolutions = [...new Set(formats.map(item => String(item.height)))].sort((a, b) => Number(b) - Number(a));
  const fpsOptions = [...new Set(formats
    .filter(item => String(item.height) === resolution && item.fps)
    .map(item => Number(item.fps)).filter(Number.isFinite)
  )].sort((a, b) => b - a);

  const startDownload = async event => {
    event.preventDefault();
    if (!url.trim() || !resolution) {
      setVariant('warning');
      setMessage('Fetch video information and select a resolution first.');
      return;
    }
    setLoadingDownload(true);
    setMessage('');
    try {
      const response = await axios.post(API_BASE_URL + '/download', {
        url: url.trim(), resolution, fps: fps === 'Any' ? null : fps
      }, { timeout: 10 * 60 * 1000, responseType: 'blob' });
      const disposition = response.headers['content-disposition'] || '';
      const filenameMatch = disposition.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
      const filename = filenameMatch
        ? decodeURIComponent(filenameMatch[1] || filenameMatch[2])
        : 'sonic-download';
      const blobUrl = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
      setVariant('success');
      setMessage('Your download has been sent to the browser.');
    } catch (error) {
      setVariant('danger');
      let apiMessage = error.response && error.response.data && error.response.data.error;
      if (error.response && error.response.data instanceof Blob) {
        try {
          const payload = JSON.parse(await error.response.data.text());
          apiMessage = payload.error;
        } catch {
          apiMessage = null;
        }
      }
      setMessage(apiMessage || 'Download failed. Check the backend logs and try again.');
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
            {loadingDownload ? <><Spinner as="span" size="sm" animation="border" className="me-2" />Downloading...</> : 'Download'}
          </Button>
          <p className="small text-muted mt-2 mb-0">
            The completed file is sent to your browser. Live byte-level progress is not yet available.
          </p>
        </Form>
      )}
    </Container>
  );
};

export default Downloader;

import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Container, Form, Button, ProgressBar, Alert } from 'react-bootstrap';

const Downloader = () => {
  const [url, setUrl] = useState('');
  const [platform, setPlatform] = useState('YouTube');
  const [resolution, setResolution] = useState('');
  const [fps, setFps] = useState('Any');
  const [resolutions, setResolutions] = useState([]);
  const [fpsOptions, setFpsOptions] = useState([]);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('');
  const [loadingInfo, setLoadingInfo] = useState(false);

  const fetchVideoInfo = async (url) => {
    setLoadingInfo(true);
    try {
      const response = await axios.post('http://localhost:4000/video-info', { url });
      console.log(response.data); // Logging the response for debugging
      setResolutions(response.data.resolutions);
      setFpsOptions(response.data.fpsOptions);
      setMessage('Video info fetched successfully.');
    } catch (error) {
      setMessage(`Error fetching video info: ${error.message}`);
    } finally {
      setLoadingInfo(false);
    }
  };

  useEffect(() => {
    if (url) {
      fetchVideoInfo(url);
    } else {
      setResolutions([]);
      setFpsOptions([]);
    }
  }, [url]);

  const startDownload = async () => {
    if (!url || !platform || !resolution) {
      setMessage('Please fill in all required fields.');
      return;
    }
    setMessage('Starting download...');
    setProgress(0);

    try {
      const response = await axios.post('http://localhost:4000/download', {
        url,
        platform,
        resolution,
        fps: fps !== 'Any' ? fps : null,
      }, {
        onDownloadProgress: progressEvent => {
          const total = progressEvent.total;
          const current = progressEvent.loaded;
          setProgress((current / total) * 100);
        }
      });

      setMessage('Download and processing completed successfully!');
    } catch (error) {
      setMessage(`Error: ${error.message}`);
    }
  };

  return (
    <Container className="mt-5">
      <h1>SONIC⚡Downloader</h1>
      {message && <Alert variant="info">{message}</Alert>}
      <Form>
        <Form.Group controlId="platform">
          <Form.Label>Select Platform</Form.Label>
          <Form.Control as="select" value={platform} onChange={e => setPlatform(e.target.value)}>
            <option>YouTube</option>
            <option>Instagram</option>
            <option>Snapchat</option>
          </Form.Control>
        </Form.Group>
        <Form.Group controlId="url">
          <Form.Label>Video URL</Form.Label>
          <Form.Control type="text" value={url} onChange={e => setUrl(e.target.value)} placeholder="Enter video URL" />
        </Form.Group>
        {loadingInfo ? <p>Loading video info...</p> : (
          <>
            <Form.Group controlId="resolution">
              <Form.Label>Select Resolution</Form.Label>
              <Form.Control as="select" value={resolution} onChange={e => setResolution(e.target.value)}>
                {resolutions.map(res => <option key={res} value={res}>{res}</option>)}
              </Form.Control>
            </Form.Group>
            <Form.Group controlId="fps">
              <Form.Label>Select FPS</Form.Label>
              <Form.Control as="select" value={fps} onChange={e => setFps(e.target.value)}>
                <option>Any</option>
                {fpsOptions.map(fpsOption => <option key={fpsOption} value={fpsOption}>{fpsOption}</option>)}
              </Form.Control>
            </Form.Group>
          </>
        )}
        <Button onClick={startDownload}>Download</Button>
      </Form>
      {progress > 0 && <ProgressBar now={progress} label={`${progress}%`} />}
    </Container>
  );
};

export default Downloader;
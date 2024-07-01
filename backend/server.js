const express = require('express');
const { exec } = require('child_process');
const cors = require('cors');

const app = express();
const PORT = 4000;

const PYTHON_COMMAND = 'python'; // Adjust this based on your Python installation
const YT_DLP_MODULE = '-m yt_dlp'; // Adjust this if yt_dlp is installed as a module

app.use(cors());
app.use(express.json());

// Endpoint to handle video download
app.post('/download', (req, res) => {
  const { url, platform, resolution, fps } = req.body;

  let format = `bestvideo[height<=${resolution}]+bestaudio/best[height<=${resolution}]`;
  if (fps && fps !== 'Any') format += `[fps<=${fps.replace('fps', '')}]`;

  const command = `${PYTHON_COMMAND} ${YT_DLP_MODULE} -f "${format}" -o "%(title)s.%(ext)s" ${url}`;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error.message}`);
      res.status(500).send(`Error: ${error.message}`);
    } else if (stderr) {
      console.error(`Stderr: ${stderr}`);
      res.status(500).send(`Stderr: ${stderr}`);
    } else {
      console.log(`Stdout: ${stdout}`);
      res.status(200).send('Download and processing completed successfully!');
    }
  });
});

app.post('/video-info', (req, res) => {
  const { url } = req.body;
  const command = `${PYTHON_COMMAND} ${YT_DLP_MODULE} -F ${url}`;

  exec(command, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error.message}`);
      res.status(500).send(`Error: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`Stderr: ${stderr}`);
      res.status(500).send(`Stderr: ${stderr}`);
      return;
    }

    // Log the full output for debugging
    console.log('yt-dlp Output:', stdout);

    const formats = stdout.split('\n').filter(line => line.includes('video only') || line.match(/\d+p/));

    // Log the filtered formats for debugging
    console.log('Filtered Formats:', formats);

    const resolutions = Array.from(new Set(
      formats.map(format => {
        const match = format.match(/\d+p/);
        return match ? match[0] : null;
      }).filter(Boolean)
    ));

    // Log the extracted resolutions for debugging
    console.log('Extracted Resolutions:', resolutions);

    const fpsOptions = Array.from(new Set(
      formats.map(format => {
        const match = format.match(/\b(\d{2})\b/); // Adjusted regex to match FPS
        return match ? `${match[1]}fps` : null;
      }).filter(Boolean)
    ));

    // Log the extracted FPS options for debugging
    console.log('Extracted FPS Options:', fpsOptions);

    if (resolutions.length === 0) {
      res.status(500).send('No video resolutions found.');
    } else {
      res.status(200).json({ resolutions, fpsOptions });
    }
  });
});



// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

import React from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import 'bootstrap/dist/css/bootstrap.min.css';
import App from './App';

const container = document.getElementById('root');
const root = createRoot(container); // createRoot container

root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

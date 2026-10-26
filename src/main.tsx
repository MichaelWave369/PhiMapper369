import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import StageTable from './stage/StageTable';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{new URLSearchParams(window.location.search).has('table')
    ? <StageTable /> : <App />}</React.StrictMode>
);

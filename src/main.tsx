import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import StageTable from './stage/StageTable';
import StageDisplay from './stage/StageDisplay';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>{new URLSearchParams(window.location.search).has('table')
    ? <StageTable /> : new URLSearchParams(window.location.search).has('display')
    ? <StageDisplay /> : <App />}</React.StrictMode>
);

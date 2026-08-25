import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@/App';
import '@/styles.css';

const host = document.getElementById('admin-root');
if (!host) throw new Error('admin-root is missing from admin.html');

createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>
);

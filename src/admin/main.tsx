import { createRoot } from 'react-dom/client';
import App from './App';
import '../admin.css';

const host = document.getElementById('admin-root');
if (!host) throw new Error('#admin-root is missing from admin.html');

createRoot(host).render(<App />);

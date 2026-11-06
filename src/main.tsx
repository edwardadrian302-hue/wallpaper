import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import './pagination.css';
import { isDesktop } from './lib/desktop';
const root = document.getElementById('root')!;
if (isDesktop()) {
  ReactDOM.createRoot(root).render(<React.StrictMode><App /></React.StrictMode>);
} else {
  root.textContent = '请打开青野壁纸桌面程序。';
}

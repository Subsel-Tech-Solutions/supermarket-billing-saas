// src/index.js
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import * as serviceWorkerRegistration from './serviceWorkerRegistration';
import { toast } from 'react-hot-toast';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://cra.link/PWA
serviceWorkerRegistration.register({
  onUpdate: (registration) => {
    toast((t) => (
      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span>A new version of SuperMart is ready!</span>
        <button
          className="btn-primary"
          style={{ padding: "4px 10px", fontSize: 12 }}
          onClick={() => {
            if (registration?.waiting) {
              registration.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
            window.location.reload();
          }}
        >
          Update
        </button>
      </span>
    ), { duration: 10000, id: 'sw-update' });
  },
  onSuccess: () => {
    console.log('SuperMart POS app shell is cached for offline availability.');
  },
});

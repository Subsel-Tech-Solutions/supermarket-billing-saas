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

// Register the production service worker for precaching and offline app-shell access.
serviceWorkerRegistration.register({
  onUpdate: (event) => {
    toast((t) => (
      <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span>A new version of SuperMart is ready!</span>
        <button
          className="btn-primary"
          style={{ padding: "4px 10px", fontSize: 12 }}
          onClick={() => {
            navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
            event.sw.postMessage({ type: "SKIP_WAITING" });
          }}
        >
          Update
        </button>
      </span>
    ), { duration: 10000, id: 'sw-update' });
  },
});

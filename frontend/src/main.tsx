import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'
import { getFirebaseServiceWorkerConfig } from './firebase'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)

// Registrar Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const firebaseConfig = getFirebaseServiceWorkerConfig()
    const workerUrl = new URL('/sw.js', window.location.origin)

    if (firebaseConfig) {
      workerUrl.searchParams.set('firebaseConfig', btoa(JSON.stringify(firebaseConfig)))
    }

    navigator.serviceWorker.register(workerUrl.toString()).then((registration) => {
      console.log('Service Worker registrado com sucesso:', registration);
    }).catch((error) => {
      console.log('Falha ao registrar Service Worker:', error);
    });
  });
}

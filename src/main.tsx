import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {registerSW} from 'virtual:pwa-register';
import App from './App';
import {ErrorBoundary} from './components/common/ErrorBoundary';
import {testFirestoreConnection} from './infrastructure/firebase/firebaseClient';
import './index.css';

// Register PWA Service Worker for offline asset & photo caching
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  registerSW({immediate: true});
}

// Verify Firestore connectivity on startup
void testFirestoreConnection();

const rootEl = document.getElementById('root');
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}

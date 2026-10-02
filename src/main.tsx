import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/pixelify-sans/400.css';
import '@fontsource/pixelify-sans/500.css';
import '@fontsource/pixelify-sans/600.css';
import '@fontsource/pixelify-sans/700.css';
import '@fontsource/chakra-petch/400.css';
import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/600.css';
import '@fontsource/chakra-petch/700.css';
import './styles.css';
import { App } from './App';
import { installPixelCursors } from './lib/cursor';

// Canvas text doesn't trigger font downloads on its own — warm both faces (incl. the Thai subset).
for (const spec of ['500 12px "Pixelify Sans"', '600 12px "Pixelify Sans"', '500 12px "Chakra Petch"']) {
  document.fonts.load(spec, 'Aa กขค').catch(() => {});
}

installPixelCursors();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Installable app. Production only — in development it would cache the dev server's files.
if (import.meta.env.PROD && 'serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => void navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

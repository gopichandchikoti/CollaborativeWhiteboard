import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { loadContent, t } from './lib/content';

async function bootstrap() {
  const contentAvailable = await loadContent();
  document.title = t('app.name');
  const root = document.getElementById('root');
  if (!root) throw new Error('Missing application root');
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App contentFallback={!contentAvailable} />
    </React.StrictMode>,
  );
}
void bootstrap();

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { router } from '@shulkr/frontend/routes';
import '@shulkr/frontend/i18n';
import '@fontsource-variable/inter';
import '@fontsource-variable/inter/wght-italic.css';
import '@fontsource-variable/jetbrains-mono';
import '@fontsource-variable/jetbrains-mono/wght-italic.css';
import '@fontsource/quattrocento/400.css';
import '@fontsource/quattrocento/700.css';
import '@shulkr/frontend/globals.css';
import 'flag-icons/css/flag-icons.min.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { router } from '@shulkr/frontend/routes';
import '@shulkr/frontend/i18n';
import '@shulkr/frontend/globals.css';
import 'flag-icons/css/flag-icons.min.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);

import { Navigate } from '@tanstack/react-router';

export function SettingsPage() {
  return <Navigate to={'/app/settings/general'} />;
}

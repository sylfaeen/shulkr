import { Navigate, useParams } from '@tanstack/react-router';

export function ServerSettingsPage() {
  const { id } = useParams({ strict: false });
  return <Navigate to={'/app/servers/$id/settings/general'} params={{ id: id || '' }} />;
}

import { useEffect, useRef, type PropsWithChildren } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useRefreshToken } from '@shulkr/frontend/hooks/use_auth';
import { useNeedsSetup } from '@shulkr/frontend/hooks/use_onboarding';
import { useAuthStore } from '@shulkr/frontend/stores/auth_store';
import { Loader2 } from 'lucide-react';

export function AuthInitializer({ children }: PropsWithChildren) {
  const navigate = useNavigate();
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const setInitialized = useAuthStore((state) => state.setInitialized);
  const refreshToken = useRefreshToken();
  const needsSetup = useNeedsSetup();
  const initAttemptedRef = useRef(false);
  useEffect(() => {
    if (needsSetup.isLoading) return;
    if (needsSetup.data?.needsSetup) {
      setInitialized(true);
      navigate({ to: '/setup' }).then();
      return;
    }
    // Try to restore the session from the refresh token on app loading (only once)
    if (!isInitialized && !initAttemptedRef.current) {
      initAttemptedRef.current = true;
      refreshToken.mutate(undefined, {
        onSettled: () => {
          setInitialized(true);
        },
      });
    }
  }, [isInitialized, needsSetup.isLoading, needsSetup.data, refreshToken, setInitialized, navigate]);
  if (!isInitialized) {
    return (
      <div className={'flex min-h-screen items-center justify-center bg-zinc-50'}>
        <Loader2 className={'size-6 animate-spin text-green-600'} />
      </div>
    );
  }
  return children;
}

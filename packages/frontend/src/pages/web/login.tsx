import { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AlertCircle } from 'lucide-react';
import { ErrorCodes } from '@shulkr/shared';
import { ApiError } from '@shulkr/frontend/lib/api';
import { useLogin, useVerifyTotpLogin, getAuthErrorMessage } from '@shulkr/frontend/hooks/use_auth';
import { useAuthStore } from '@shulkr/frontend/stores/auth_store';
import { BrandPanel } from '@shulkr/frontend/pages/web/features/brand_panel';
import { TotpLoginStep } from '@shulkr/frontend/features/totp/totp_login_step';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';
import { Button } from '@shulkr/frontend/features/ui/base/button';
import { Input } from '@shulkr/frontend/features/ui/base/input';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@shulkr/frontend/features/ui/base/form';

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

type LoginFormValues = z.infer<typeof loginSchema>;

type LoginStep = 'credentials' | 'totp';

export function LoginPage() {
  const { t } = useTranslation();
  usePageTitle('Login');
  const navigate = useNavigate();
  const [step, setStep] = useState<LoginStep>('credentials');
  const [totpToken, setTotpToken] = useState<string | null>(null);
  const [totpError, setTotpError] = useState<string | null>(null);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isInitialized = useAuthStore((state) => state.isInitialized);
  const login = useLogin((token) => {
    setTotpToken(token);
    setStep('totp');
  });
  const verifyTotp = useVerifyTotpLogin();
  const errorMessage = getAuthErrorMessage(login.error as Error | null, t);
  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: '',
      password: '',
    },
  });
  useEffect(() => {
    if (isAuthenticated && isInitialized) {
      navigate({ to: '/' }).then();
    }
  }, [isAuthenticated, isInitialized, navigate]);
  const onFormSubmit = (data: LoginFormValues) => {
    login.mutate(data);
  };
  const handleTotpVerify = (code: string) => {
    if (!totpToken) return;
    setTotpError(null);
    verifyTotp.mutate(
      { totp_token: totpToken, code },
      {
        onError: (error) => {
          if (error instanceof ApiError) {
            if (error.message === ErrorCodes.TOTP_INVALID_CODE) {
              setTotpError(t('auth.totp.invalidCode'));
            } else if (error.message === ErrorCodes.AUTH_TOKEN_EXPIRED) {
              setTotpError(t('auth.totp.sessionExpired'));
              setStep('credentials');
              setTotpToken(null);
            } else {
              setTotpError(t('authErrors.generic'));
            }
          } else {
            setTotpError(t('authErrors.generic'));
          }
        },
      }
    );
  };
  const handleTotpBack = () => {
    setStep('credentials');
    setTotpToken(null);
    setTotpError(null);
  };
  return (
    <div className={'flex min-h-screen'}>
      <BrandPanel />
      <div className={'flex w-full flex-col items-center justify-center bg-gray-100/80 p-6 lg:w-1/2 lg:p-12 dark:bg-zinc-900'}>
        <div className={'w-full max-w-120'}>
          {step === 'credentials' && (
            <>
              <div className={'mb-8 flex flex-col items-center lg:hidden'}>
                <div
                  className={
                    'mb-4 flex size-10 items-center justify-center rounded-lg bg-linear-to-br from-green-500 to-amber-500 shadow-sm'
                  }
                >
                  <span className={'text-lg font-bold text-white'}>R</span>
                </div>
                <h1 className={'text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100'}>{t('auth.welcome')}</h1>
                <p className={'mt-1 text-sm text-zinc-500 dark:text-zinc-400'}>{t('auth.subtitle')}</p>
              </div>
              <div className={'hidden lg:block'}>
                <h1 className={'text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100'}>{t('auth.welcome')}</h1>
                <p className={'mt-1 mb-8 text-sm text-zinc-500 dark:text-zinc-400'}>{t('auth.subtitle')}</p>
              </div>
              <div className={'shadow-card rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-800'}>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onFormSubmit)} className={'space-y-4'}>
                    {errorMessage && (
                      <div
                        className={
                          'flex items-center gap-2.5 rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-600 dark:bg-red-950'
                        }
                      >
                        <AlertCircle className={'size-4 shrink-0'} />
                        <span>{errorMessage}</span>
                      </div>
                    )}
                    <FormField
                      control={form.control}
                      name={'username'}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('auth.username')}</FormLabel>
                          <FormControl>
                            <Input type={'text'} autoComplete={'username'} placeholder={t('auth.username')} {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={'password'}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('auth.password')}</FormLabel>
                          <FormControl>
                            <Input
                              type={'password'}
                              autoComplete={'current-password'}
                              placeholder={t('auth.password')}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button type={'submit'} size={'default'} loading={login.isPending} className={'w-full'}>
                      {login.isPending ? t('auth.loggingIn') : t('auth.loginButton')}
                    </Button>
                  </form>
                </Form>
              </div>
            </>
          )}
          {step === 'totp' && (
            <TotpLoginStep onVerify={handleTotpVerify} onBack={handleTotpBack} error={totpError} loading={verifyTotp.isPending} />
          )}
        </div>
      </div>
    </div>
  );
}

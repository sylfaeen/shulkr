import { useState, useEffect } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check, CircleX, Eye, EyeOff, Loader2, ArrowRight } from 'lucide-react';
import { ErrorCodes } from '@shulkr/shared';
import { ApiError } from '@shulkr/frontend/lib/api';
import { useNeedsSetup, useSetup } from '@shulkr/frontend/hooks/use_onboarding';
import { useTotpSetup, useTotpVerify } from '@shulkr/frontend/hooks/use_totp';
import { BrandPanel } from '@shulkr/frontend/pages/web/features/brand_panel';
import { TotpOnboardingStep } from '@shulkr/frontend/features/totp/totp_onboarding_step';
import { Button } from '@shulkr/frontend/features/ui/base/button';
import { Input } from '@shulkr/frontend/features/ui/base/input';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@shulkr/frontend/features/ui/base/form';
import { cn } from '@shulkr/frontend/lib/cn';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';
import { getPasswordStrength } from '@shulkr/frontend/lib/password';

type SetupStep = 'account' | 'security' | 'complete';

type AccountData = {
  username: string;
  password: string;
  confirmPassword: string;
};

const accountSchema = z
  .object({
    username: z
      .string()
      .min(3)
      .max(32)
      .regex(/^[a-zA-Z0-9_-]+$/),
    password: z
      .string()
      .min(8)
      .max(128)
      .regex(/[a-zA-Z]/, 'Password must contain at least one letter')
      .regex(/[0-9]/, 'Password must contain at least one number'),
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords must match',
    path: ['confirmPassword'],
  });

type AccountFormValues = z.infer<typeof accountSchema>;

const ONBOARDING_PENDING_KEY = 'shulkr_onboarding_pending';

export function SetupPage() {
  const { t } = useTranslation();
  usePageTitle('Setup');
  const navigate = useNavigate();
  const needsSetup = useNeedsSetup();
  const totpSetup = useTotpSetup();
  const totpVerify = useTotpVerify();
  const [step, setStep] = useState<SetupStep>(() => {
    const pending = sessionStorage.getItem(ONBOARDING_PENDING_KEY);
    return pending === 'security' ? 'security' : 'account';
  });
  const [accountData, setAccountData] = useState<AccountData>({
    username: '',
    password: '',
    confirmPassword: '',
  });
  const [setupError, setSetupError] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<Array<string> | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const changeStep = (newStep: SetupStep) => {
    if (newStep === 'security') {
      sessionStorage.setItem(ONBOARDING_PENDING_KEY, 'security');
    } else {
      sessionStorage.removeItem(ONBOARDING_PENDING_KEY);
    }
    setStep(newStep);
  };
  useEffect(() => {
    if (needsSetup.data && !needsSetup.data.needsSetup && step === 'account') {
      navigate({ to: '/' }).then();
    }
  }, [needsSetup.data, navigate, step]);
  if (needsSetup.isLoading) {
    return (
      <div className={'flex min-h-screen items-center justify-center bg-gray-100/80 dark:bg-zinc-900'}>
        <Loader2 className={'size-5 animate-spin text-zinc-400 dark:text-zinc-500'} />
      </div>
    );
  }
  const handleTotpSetupStart = () => {
    totpSetup.mutate(undefined);
  };
  const handleTotpVerify = (code: string) => {
    setVerifyError(null);
    totpVerify.mutate(
      { code },
      {
        onSuccess: () => {
          setRecoveryCodes(totpSetup.data?.recovery_codes ?? null);
        },
        onError: (error) => {
          if (error instanceof ApiError && error.message === ErrorCodes.TOTP_INVALID_CODE) {
            setVerifyError(t('settings.twoFactor.invalidCode'));
          } else {
            setVerifyError(t('authErrors.generic'));
          }
        },
      }
    );
  };
  return (
    <div className={'flex min-h-screen'}>
      <BrandPanel />
      <div className={'flex w-full flex-col items-center justify-center bg-gray-100/80 p-6 lg:w-1/2 lg:p-12 dark:bg-zinc-900'}>
        {step === 'account' && (
          <AccountStep
            onComplete={() => changeStep('security')}
            onSetupError={setSetupError}
            onChange={setAccountData}
            {...{ accountData, setupError }}
          />
        )}
        {step === 'security' && (
          <TotpOnboardingStep
            qrCodeUri={totpSetup.data?.qr_code_uri ?? null}
            secret={totpSetup.data?.secret ?? null}
            onSetupStart={handleTotpSetupStart}
            onVerify={handleTotpVerify}
            onComplete={() => changeStep('complete')}
            onSkip={() => changeStep('complete')}
            setupLoading={totpSetup.isPending}
            verifyLoading={totpVerify.isPending}
            {...{ recoveryCodes, verifyError }}
          />
        )}
        {step === 'complete' && <CompleteStep username={accountData.username} />}
      </div>
    </div>
  );
}

function AccountStep({
  accountData,
  setupError,
  onChange,
  onSetupError,
  onComplete,
}: {
  accountData: AccountData;
  setupError: string | null;
  onChange: (data: AccountData) => void;
  onSetupError: (error: string | null) => void;
  onComplete: () => void;
}) {
  const { t, i18n } = useTranslation();
  const setup = useSetup();
  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      username: accountData.username,
      password: accountData.password,
      confirmPassword: accountData.confirmPassword,
    },
    mode: 'onBlur',
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [selectedLang, setSelectedLang] = useState('en');
  const watchedPassword = form.watch('password');
  const strength = getPasswordStrength(watchedPassword);
  const languages = [
    { code: 'en', name: 'English', flag: '\uD83C\uDDEC\uD83C\uDDE7' },
    { code: 'fr', name: 'Fran\u00e7ais', flag: '\uD83C\uDDEB\uD83C\uDDF7' },
  ];
  const handleLanguageChange = (code: string) => {
    setSelectedLang(code);
    i18n.changeLanguage(code).then();
  };
  const handleFormSubmit = (data: AccountFormValues) => {
    onSetupError(null);
    onChange({ username: data.username, password: data.password, confirmPassword: data.confirmPassword });
    setup
      .mutateAsync({
        username: data.username,
        password: data.password,
        locale: selectedLang,
      })
      .then(() => onComplete())
      .catch((error: unknown) => {
        if (error instanceof Error) {
          onSetupError(error.message);
        } else {
          onSetupError(t('errors.generic'));
        }
      });
  };
  return (
    <div className={'w-full max-w-120'}>
      <div className={'animate-fade-in'}>
        <div className={'mb-8 flex flex-col items-center lg:hidden'}>
          <div
            className={
              'mb-4 flex size-10 items-center justify-center rounded-lg bg-linear-to-br from-green-500 to-amber-500 shadow-sm'
            }
          >
            <span className={'text-lg font-bold text-white'}>R</span>
          </div>
          <h1 className={'text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100'}>
            {t('onboarding.welcome.title')}
          </h1>
          <p className={'mt-1 text-sm text-zinc-500 dark:text-zinc-400'}>{t('onboarding.welcome.subtitle')}</p>
        </div>
        <div className={'hidden lg:block'}>
          <h1 className={'text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100'}>
            {t('onboarding.welcome.title')}
          </h1>
          <p className={'mt-1 mb-8 text-sm text-zinc-500 dark:text-zinc-400'}>{t('onboarding.welcome.subtitle')}</p>
        </div>
        <div className={'shadow-card rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-800'}>
          <h2 className={'mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-100'}>{t('onboarding.account.title')}</h2>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(handleFormSubmit)} className={'space-y-4'}>
              <FormField
                control={form.control}
                name={'username'}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('onboarding.account.username')}</FormLabel>
                    <FormControl>
                      <Input
                        type={'text'}
                        autoComplete={'username'}
                        placeholder={t('onboarding.account.usernamePlaceholder')}
                        {...field}
                      />
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
                    <FormLabel>{t('onboarding.account.password')}</FormLabel>
                    <div className={'relative'}>
                      <FormControl>
                        <Input
                          type={showPassword ? 'text' : 'password'}
                          autoComplete={'new-password'}
                          placeholder={t('onboarding.account.passwordPlaceholder')}
                          className={'pr-10'}
                          {...field}
                        />
                      </FormControl>
                      <Button
                        onClick={() => setShowPassword(!showPassword)}
                        variant={'ghost'}
                        size={'icon-sm'}
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                        className={
                          'absolute top-1/2 right-1.5 size-7 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300'
                        }
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className={'size-4'} /> : <Eye className={'size-4'} />}
                      </Button>
                    </div>
                    <FormMessage />
                    {watchedPassword.length > 0 && strength && (
                      <div className={'flex items-center gap-2'}>
                        <div className={'flex flex-1 gap-1'}>
                          <div
                            className={cn(
                              'h-1 flex-1 rounded-full transition-colors duration-(--duration-normal)',
                              strength === 'weak' && 'bg-red-500',
                              strength === 'medium' && 'bg-amber-500',
                              strength === 'strong' && 'bg-green-500'
                            )}
                          />
                          <div
                            className={cn(
                              'h-1 flex-1 rounded-full transition-colors duration-(--duration-normal)',
                              strength === 'medium'
                                ? 'bg-amber-500'
                                : strength === 'strong'
                                  ? 'bg-green-500'
                                  : 'bg-zinc-200 dark:bg-zinc-700'
                            )}
                          />
                          <div
                            className={cn(
                              'h-1 flex-1 rounded-full transition-colors duration-(--duration-normal)',
                              strength === 'strong' ? 'bg-green-500' : 'bg-zinc-200 dark:bg-zinc-700'
                            )}
                          />
                        </div>
                        <span
                          className={cn(
                            'text-xs font-medium',
                            strength === 'weak' && 'text-red-500',
                            strength === 'medium' && 'text-amber-600',
                            strength === 'strong' && 'text-green-600'
                          )}
                        >
                          {strength === 'weak' && t('onboarding.account.strengthWeak')}
                          {strength === 'medium' && t('onboarding.account.strengthMedium')}
                          {strength === 'strong' && t('onboarding.account.strengthStrong')}
                        </span>
                      </div>
                    )}
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name={'confirmPassword'}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('onboarding.account.confirmPassword')}</FormLabel>
                    <div className={'relative'}>
                      <FormControl>
                        <Input
                          type={showConfirm ? 'text' : 'password'}
                          autoComplete={'new-password'}
                          placeholder={t('onboarding.account.confirmPasswordPlaceholder')}
                          className={'pr-10'}
                          {...field}
                        />
                      </FormControl>
                      <Button
                        onClick={() => setShowConfirm(!showConfirm)}
                        variant={'ghost'}
                        size={'icon-sm'}
                        aria-label={showConfirm ? 'Hide password' : 'Show password'}
                        className={
                          'absolute top-1/2 right-1.5 size-7 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300'
                        }
                        tabIndex={-1}
                      >
                        {showConfirm ? <EyeOff className={'size-4'} /> : <Eye className={'size-4'} />}
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className={'border-t border-black/10 pt-4 dark:border-white/10'}>
                <p className={'mb-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100'}>{t('onboarding.language.title')}</p>
                <div className={'grid grid-cols-2 gap-3'}>
                  {languages.map((lang) => (
                    <button
                      key={lang.code}
                      type={'button'}
                      onClick={() => handleLanguageChange(lang.code)}
                      className={cn(
                        'flex items-center gap-3 rounded-lg border px-4 py-3 transition-all duration-(--duration-fast)',
                        lang.code === selectedLang
                          ? 'border-zinc-900 bg-zinc-50 dark:border-zinc-100 dark:bg-zinc-800'
                          : 'border-black/10 hover:border-black/12 hover:bg-zinc-50/50 dark:border-white/10 dark:hover:border-white/12 dark:hover:bg-zinc-800/50'
                      )}
                    >
                      <span className={'text-xl'}>{lang.flag}</span>
                      <span
                        className={cn(
                          'text-sm font-medium',
                          lang.code === selectedLang ? 'text-zinc-900 dark:text-zinc-100' : 'text-zinc-600 dark:text-zinc-400'
                        )}
                      >
                        {lang.name}
                      </span>
                      {lang.code === selectedLang && (
                        <div
                          className={
                            'ml-auto flex size-4.5 items-center justify-center rounded-full bg-zinc-900 dark:bg-zinc-100'
                          }
                        >
                          <Check className={'size-2.5 text-white dark:text-zinc-900'} strokeWidth={3} />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
              {setupError && (
                <div
                  className={'flex items-center gap-2.5 rounded-lg bg-red-50 px-3.5 py-2.5 text-sm text-red-600 dark:bg-red-950'}
                >
                  <CircleX className={'size-4 shrink-0'} />
                  <span>{setupError}</span>
                </div>
              )}
              <Button
                type={'submit'}
                size={'default'}
                disabled={!form.formState.isValid}
                loading={setup.isPending}
                className={'w-full'}
              >
                {setup.isPending ? t('common.loading') : t('onboarding.finish')}
              </Button>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}

function CompleteStep({ username }: { username: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  return (
    <div className={'w-full max-w-100'}>
      <div className={'animate-fade-in'}>
        <div className={'shadow-card rounded-xl border border-black/10 bg-white p-8 dark:border-white/10 dark:bg-zinc-800'}>
          <div className={'flex flex-col items-center text-center'}>
            <div className={'mb-5 flex size-10 items-center justify-center rounded-full bg-green-600'}>
              <Check className={'size-5 text-white'} strokeWidth={2.5} />
            </div>
            <h2 className={'text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100'}>
              {t('onboarding.complete.title')}
            </h2>
            <p className={'mt-1.5 text-sm text-zinc-500 dark:text-zinc-400'}>
              {t('onboarding.complete.loggedInAs', { username })}
            </p>
            <Button onClick={() => navigate({ to: '/app' }).then()} size={'default'} className={'mt-6 w-full'}>
              {t('onboarding.goToPanel')}
              <ArrowRight className={'size-4'} />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

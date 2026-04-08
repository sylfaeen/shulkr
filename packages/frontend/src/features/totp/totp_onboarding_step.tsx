import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Shield, Loader2 } from 'lucide-react';
import { TotpQrDisplay, TotpCodeInput, RecoveryCodesDisplay } from '@shulkr/frontend/features/totp/totp_setup_display';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';

type SecuritySubStep = 'prompt' | 'setup' | 'recovery';

type TotpOnboardingStepProps = {
  qrCodeUri: string | null;
  secret: string | null;
  recoveryCodes: Array<string> | null;
  onSetupStart: () => void;
  onVerify: (code: string) => void;
  onComplete: () => void;
  onSkip: () => void;
  setupLoading?: boolean;
  verifyError?: string | null;
  verifyLoading?: boolean;
};

export function TotpOnboardingStep({
  qrCodeUri,
  secret,
  recoveryCodes,
  onSetupStart,
  onVerify,
  onComplete,
  onSkip,
  setupLoading,
  verifyError,
  verifyLoading,
}: TotpOnboardingStepProps) {
  const { t } = useTranslation();

  const [subStep, setSubStep] = useState<SecuritySubStep>('prompt');
  const [code, setCode] = useState('');

  const handleSetupStart = () => {
    onSetupStart();
    setSubStep('setup');
  };

  const handleVerify = (verifyCode: string) => {
    onVerify(verifyCode);
  };

  if (recoveryCodes && subStep === 'setup') {
    setSubStep('recovery');
  }

  return (
    <div className={'animate-fade-in w-full'}>
      {subStep === 'prompt' && (
        <div className={'mx-auto w-full max-w-100'}>
          <div className={'shadow-card rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-800'}>
            <div className={'flex flex-col items-center text-center'}>
              <div className={'mb-4 flex size-12 items-center justify-center rounded-full bg-green-600/10'}>
                <Shield className={'size-6 text-green-600'} strokeWidth={2} />
              </div>
              <h2 className={'text-lg font-semibold text-zinc-900 dark:text-zinc-100'}>{t('onboarding.security.title')}</h2>
              <p className={'mt-1.5 max-w-xs text-sm text-zinc-500 dark:text-zinc-400'}>{t('onboarding.security.subtitle')}</p>
            </div>
            <div className={'mt-6 space-y-2.5'}>
              <Button onClick={handleSetupStart} size={'default'} loading={setupLoading} className={'w-full'}>
                <Shield className={'size-4'} />
                {t('onboarding.security.enable')}
              </Button>
              <Button
                onClick={onSkip}
                variant={'link'}
                size={'default'}
                className={'w-full text-zinc-500 no-underline hover:text-zinc-700 dark:hover:text-zinc-300'}
              >
                {t('onboarding.security.skip')}
              </Button>
            </div>
          </div>
        </div>
      )}
      {subStep === 'setup' && (
        <div className={'mx-auto w-full max-w-180'}>
          <div className={'shadow-card rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-800'}>
            <h2 className={'mb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100'}>
              {t('onboarding.security.setupTitle')}
            </h2>
            <p className={'mb-5 text-xs text-zinc-500 dark:text-zinc-400'}>{t('onboarding.security.setupDescription')}</p>
            {qrCodeUri && secret ? (
              <div className={'space-y-5'}>
                <TotpQrDisplay {...{ qrCodeUri, secret }} />
                <div className={'border-t border-black/10 pt-5 dark:border-white/10'}>
                  <TotpCodeInput
                    onChange={setCode}
                    onSubmit={handleVerify}
                    error={verifyError}
                    loading={verifyLoading}
                    {...{ code }}
                  />
                </div>
              </div>
            ) : (
              <div className={'flex items-center justify-center py-12'}>
                <Loader2 className={'size-6 animate-spin text-zinc-400'} />
              </div>
            )}
          </div>
        </div>
      )}
      {subStep === 'recovery' && recoveryCodes && (
        <div className={'mx-auto w-full max-w-180'}>
          <div className={'shadow-card rounded-xl border border-black/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-800'}>
            <h2 className={'mb-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100'}>
              {t('settings.twoFactor.recoveryCodes.title')}
            </h2>
            <p className={'mb-5 text-xs text-zinc-500 dark:text-zinc-400'}>{t('settings.twoFactor.recoveryCodes.subtitle')}</p>
            <RecoveryCodesDisplay codes={recoveryCodes} onDone={onComplete} />
          </div>
        </div>
      )}
    </div>
  );
}

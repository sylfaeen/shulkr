import { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Upload } from 'lucide-react';
import { useExportConfig, useImportConfig } from '@shulkr/frontend/hooks/use_server_config';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';
import { useToast } from '@shulkr/frontend/features/ui/toast';

type ConfigExportImportProps = {
  serverId: string;
};

export function ConfigExportImport({ serverId }: ConfigExportImportProps) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const exportConfig = useExportConfig(serverId);
  const importConfig = useImportConfig(serverId);

  const handleExport = async () => {
    try {
      const config = await exportConfig.mutateAsync();
      const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${config.metadata.name.toLowerCase().replace(/\s+/g, '-')}.shulkr-config`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      addToast({ type: 'success', title: t('config.exportSuccess') });
    } catch {
      addToast({ type: 'error', title: t('config.exportError') });
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const config = JSON.parse(text);
      await importConfig.mutateAsync(config);
    } catch {
      addToast({ type: 'error', title: t('config.importInvalidFile') });
    }

    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <FeatureCard>
      <FeatureCard.Header>
        <FeatureCard.Content>
          <FeatureCard.Title>{t('config.title')}</FeatureCard.Title>
          <FeatureCard.Description>{t('config.description')}</FeatureCard.Description>
        </FeatureCard.Content>
      </FeatureCard.Header>
      <FeatureCard.Body>
        <FeatureCard.Row>
          <FeatureCard.RowLabel description={t('config.exportDescription')}>{t('config.export')}</FeatureCard.RowLabel>
          <FeatureCard.RowControl>
            <Button
              onClick={handleExport}
              variant={'secondary'}
              size={'sm'}
              disabled={exportConfig.isPending}
              loading={exportConfig.isPending}
            >
              <Download className={'size-4'} />
              {t('config.exportButton')}
            </Button>
          </FeatureCard.RowControl>
        </FeatureCard.Row>
        <FeatureCard.Row>
          <FeatureCard.RowLabel description={t('config.importDescription')}>{t('config.import')}</FeatureCard.RowLabel>
          <FeatureCard.RowControl>
            <Button
              onClick={handleImportClick}
              variant={'secondary'}
              size={'sm'}
              disabled={importConfig.isPending}
              loading={importConfig.isPending}
            >
              <Upload className={'size-4'} />
              {t('config.importButton')}
            </Button>
            <input
              ref={fileInputRef}
              type={'file'}
              accept={'.shulkr-config,.json'}
              onChange={handleFileChange}
              className={'hidden'}
            />
          </FeatureCard.RowControl>
        </FeatureCard.Row>
      </FeatureCard.Body>
    </FeatureCard>
  );
}

import { BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shulkr/frontend/features/ui/base/tooltip';
import { DOCS_URL } from '@shulkr/frontend/lib/docs';

export function DocsLink({ page }: { page: string }) {
  const { t } = useTranslation();

  return (
    <TooltipProvider delay={200}>
      <Tooltip>
        <TooltipTrigger
          render={
            <a
              href={`${DOCS_URL}/${page}`}
              target={'_blank'}
              rel={'noopener noreferrer'}
              className={
                'inline-flex items-center rounded-md p-1 text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300'
              }
            >
              <BookOpen className={'size-4'} strokeWidth={2} />
            </a>
          }
        />
        <TooltipContent>
          <p>{t('common.documentation')}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

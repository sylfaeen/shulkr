import { BookOpen } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from '@tanstack/react-router';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shulkr/frontend/features/ui/base/tooltip';

export function DocsLink({ path }: { path: string }) {
  const { t } = useTranslation();
  const slug = path.replace(/^\/guide\//, '').replace(/^\//, '');
  return (
    <TooltipProvider delay={200}>
      <Tooltip>
        <TooltipTrigger
          render={
            <Link
              to={'/app/docs/$slug'}
              params={{ slug }}
              className={
                'inline-flex items-center rounded-md p-1 text-zinc-400 transition-colors hover:text-zinc-600 dark:hover:text-zinc-300'
              }
            >
              <BookOpen className={'size-4'} strokeWidth={2} />
            </Link>
          }
        />
        <TooltipContent>
          <p>{t('common.documentation')}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

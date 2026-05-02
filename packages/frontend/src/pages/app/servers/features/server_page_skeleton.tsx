import { Skeleton } from '@shulkr/frontend/features/ui/base/skeleton';

export function ServerPageSkeleton() {
  return (
    <>
      <div className={'header'}>
        <div className={'flex items-center gap-3'}>
          <Skeleton className={'size-10 rounded-xl'} />
          <div className={'flex flex-col gap-1.5'}>
            <div className={'flex items-center gap-2'}>
              <Skeleton className={'h-5 w-28'} />
              <Skeleton className={'h-5 w-16'} />
            </div>
            <Skeleton className={'h-4 w-40'} />
          </div>
        </div>
      </div>
      <div className={'content'}>
        <div className={'content-container'}>
          <div className={'flex flex-col gap-4'}>
            <Skeleton className={'h-32 w-full rounded-xl'} />
            <Skeleton className={'h-48 w-full rounded-xl'} />
          </div>
        </div>
      </div>
    </>
  );
}

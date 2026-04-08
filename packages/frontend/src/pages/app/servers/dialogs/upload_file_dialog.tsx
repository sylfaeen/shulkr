import { useEffect, useRef, type DragEvent, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { File, Upload, X } from 'lucide-react';
import { cn } from '@shulkr/frontend/lib/cn';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '@shulkr/frontend/features/ui/shadcn/dialog';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Input } from '@shulkr/frontend/features/ui/shadcn/input';
import { formatFileSize } from '@shulkr/frontend/hooks/use_files';
import { Form, FormField, FormItem, FormLabel, FormControl } from '@shulkr/frontend/features/ui/shadcn/form';

type UploadFileDialogProps = {
  open: boolean;
  currentPath: string;
  isPending: boolean;
  onUpload: (files: Array<globalThis.File>, targetPath: string) => void;
  onClose: () => void;
};

export function UploadFileDialog({ open, currentPath, isPending, onUpload, onClose }: UploadFileDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className={'max-w-md'}>
        <DialogHeader>
          <DialogTitle>{t('files.upload')}</DialogTitle>
          <DialogDescription>{t('files.uploadDescription')}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <UploadForm {...{ currentPath, isPending, onUpload, onClose, open }} />
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

type UploadFormProps = {
  open: boolean;
  currentPath: string;
  isPending: boolean;
  onUpload: (files: Array<globalThis.File>, targetPath: string) => void;
  onClose: () => void;
};

const uploadSchema = z.object({
  targetPath: z.string().min(1),
  files: z.array(z.instanceof(globalThis.File)).min(1),
});

type UploadFormValues = z.infer<typeof uploadSchema>;

function UploadForm({ open, currentPath, isPending, onUpload, onClose }: UploadFormProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isDragOverRef = useRef(false);

  const form = useForm<UploadFormValues>({
    resolver: zodResolver(uploadSchema),
    defaultValues: {
      targetPath: currentPath,
      files: [],
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({ targetPath: currentPath, files: [] });
    }
  }, [open, currentPath, form]);

  const selectedFiles = form.watch('files');

  const addFiles = (newFiles: Array<globalThis.File>) => {
    const current = form.getValues('files');
    form.setValue('files', [...current, ...newFiles], { shouldDirty: true });
  };

  const removeFile = (index: number) => {
    const current = form.getValues('files');
    form.setValue(
      'files',
      current.filter((_, i) => i !== index),
      { shouldDirty: true }
    );
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFiles(Array.from(e.target.files));
      e.target.value = '';
    }
  };

  const handleDropZone = (e: DragEvent) => {
    e.preventDefault();
    isDragOverRef.current = false;
    const dropped = Array.from(e.dataTransfer.files);
    if (dropped.length > 0) {
      addFiles(dropped);
    }
  };

  const handleSubmit = (data: UploadFormValues) => {
    onUpload(data.files, data.targetPath);
  };

  return (
    <Form {...form}>
      <form id={'upload-file-form'} onSubmit={form.handleSubmit(handleSubmit)}>
        <div className={'space-y-4'}>
          <FormField
            control={form.control}
            name={'targetPath'}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('files.uploadDestination')}</FormLabel>
                <FormControl>
                  <Input type={'text'} placeholder={'/'} {...field} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={'files'}
            render={() => (
              <FormItem>
                <FormLabel>{t('files.files')}</FormLabel>
                <FormControl>
                  <div>
                    <input ref={fileInputRef} type={'file'} multiple onChange={handleFileSelect} className={'hidden'} />
                    <button
                      type={'button'}
                      onClick={() => fileInputRef.current?.click()}
                      onDragOver={(e) => {
                        e.preventDefault();
                        isDragOverRef.current = true;
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        isDragOverRef.current = false;
                      }}
                      onDrop={handleDropZone}
                      className={cn(
                        'flex w-full flex-col items-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-sm transition-colors',
                        'border-zinc-200 text-zinc-500 hover:border-zinc-300 hover:bg-zinc-50/50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800/50'
                      )}
                    >
                      <Upload className={'size-5 text-zinc-400 dark:text-zinc-500'} strokeWidth={2} />
                      <span>{t('files.uploadDropOrBrowse')}</span>
                    </button>
                  </div>
                </FormControl>
              </FormItem>
            )}
          />
          {selectedFiles.length > 0 && (
            <div className={'space-y-1.5'}>
              {selectedFiles.map((file, index) => (
                <div
                  key={`${file.name}-${index}`}
                  className={'flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800'}
                >
                  <div className={'flex min-w-0 items-center gap-2'}>
                    <File className={'size-4 shrink-0 text-zinc-400 dark:text-zinc-500'} strokeWidth={2} />
                    <span className={'truncate text-sm text-zinc-700 dark:text-zinc-300'}>{file.name}</span>
                    <span className={'shrink-0 text-xs text-zinc-400 dark:text-zinc-500'}>{formatFileSize(file.size)}</span>
                  </div>
                  <button
                    type={'button'}
                    onClick={() => removeFile(index)}
                    className={
                      'ml-2 shrink-0 rounded p-0.5 text-zinc-400 transition-colors hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300'
                    }
                  >
                    <X className={'size-4'} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button onClick={onClose} variant={'secondary'}>
            {t('common.cancel')}
          </Button>
          <Button type={'submit'} disabled={isPending || selectedFiles.length === 0} loading={isPending}>
            <Upload className={'size-4'} />
            {t('files.uploadCount', { count: selectedFiles.length })}
          </Button>
        </DialogFooter>
      </form>
    </Form>
  );
}

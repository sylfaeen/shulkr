import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Ban, LogOut, ShieldOff, ShieldCheck } from 'lucide-react';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Input } from '@shulkr/frontend/features/ui/shadcn/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shulkr/frontend/features/ui/shadcn/tooltip';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@shulkr/frontend/features/ui/shadcn/dialog';

type PlayerActionsProps = {
  playerName: string;
  sendCommand: (command: string) => boolean;
};

export function PlayerActions({ playerName, sendCommand }: PlayerActionsProps) {
  const { t } = useTranslation();
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [banReason, setBanReason] = useState('');

  const handleKick = () => {
    sendCommand(`kick ${playerName}`);
  };

  const handleBan = () => {
    const cmd = banReason.trim() ? `ban ${playerName} ${banReason.trim()}` : `ban ${playerName}`;
    sendCommand(cmd);
    setBanDialogOpen(false);
    setBanReason('');
  };

  const handleOp = () => {
    sendCommand(`op ${playerName}`);
  };

  const handleDeop = () => {
    sendCommand(`deop ${playerName}`);
  };

  return (
    <>
      <TooltipProvider delayDuration={300}>
        <div className={'flex items-center gap-1'}>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant={'ghost'} size={'icon-sm'} onClick={handleKick}>
                <LogOut className={'size-3.5 text-amber-500'} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('players.kick')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant={'ghost'} size={'icon-sm'} onClick={() => setBanDialogOpen(true)}>
                <Ban className={'size-3.5 text-red-500'} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('players.ban')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant={'ghost'} size={'icon-sm'} onClick={handleOp}>
                <ShieldCheck className={'size-3.5 text-green-500'} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('players.op')}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant={'ghost'} size={'icon-sm'} onClick={handleDeop}>
                <ShieldOff className={'size-3.5 text-zinc-400'} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{t('players.deop')}</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
      <Dialog open={banDialogOpen} onOpenChange={setBanDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('players.banConfirm')}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className={'mb-3 text-sm text-zinc-600 dark:text-zinc-400'}>{playerName}</p>
            <Input
              type={'text'}
              value={banReason}
              onChange={(e) => setBanReason(e.target.value)}
              placeholder={t('players.banReason')}
            />
          </DialogBody>
          <DialogFooter>
            <Button variant={'secondary'} onClick={() => setBanDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant={'destructive'} onClick={handleBan}>
              {t('players.ban')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

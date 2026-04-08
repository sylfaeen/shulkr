import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Ban, LogOut, Shield, ShieldOff, ShieldCheck } from 'lucide-react';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Input } from '@shulkr/frontend/features/ui/shadcn/input';
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
      <div className={'flex items-center gap-1'}>
        <Button variant={'ghost'} size={'icon-sm'} onClick={handleKick} title={t('players.kick')}>
          <LogOut className={'size-3.5 text-amber-500'} />
        </Button>
        <Button variant={'ghost'} size={'icon-sm'} onClick={() => setBanDialogOpen(true)} title={t('players.ban')}>
          <Ban className={'size-3.5 text-red-500'} />
        </Button>
        <Button variant={'ghost'} size={'icon-sm'} onClick={handleOp} title={t('players.op')}>
          <ShieldCheck className={'size-3.5 text-green-500'} />
        </Button>
        <Button variant={'ghost'} size={'icon-sm'} onClick={handleDeop} title={t('players.deop')}>
          <ShieldOff className={'size-3.5 text-zinc-400'} />
        </Button>
      </div>
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

type UnbanPanelProps = {
  sendCommand: (command: string) => boolean;
};

export function UnbanPanel({ sendCommand }: UnbanPanelProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');

  const handleUnban = () => {
    if (!name.trim()) return;
    sendCommand(`pardon ${name.trim()}`);
    setName('');
  };

  return (
    <div className={'flex items-center gap-2'}>
      <Input
        type={'text'}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder={t('players.unbanPlaceholder')}
        className={'h-8 w-40 text-sm'}
        onKeyDown={(e) => e.key === 'Enter' && handleUnban()}
      />
      <Button variant={'secondary'} size={'xs'} onClick={handleUnban} disabled={!name.trim()}>
        <Shield className={'size-3.5'} />
        {t('players.unban')}
      </Button>
    </div>
  );
}

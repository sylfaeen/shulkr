import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Ban, Gamepad2, LogOut, ShieldOff, ShieldCheck } from 'lucide-react';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Input } from '@shulkr/frontend/features/ui/shadcn/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shulkr/frontend/features/ui/shadcn/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@shulkr/frontend/features/ui/shadcn/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@shulkr/frontend/features/ui/shadcn/dialog';
import { useToast } from '@shulkr/frontend/features/ui/toast';
import { useHasPermission } from '@shulkr/frontend/hooks/use_permissions';

export function PlayerActions({ playerName, sendCommand }: { playerName: string; sendCommand: (command: string) => boolean }) {
  const { t } = useTranslation();
  const can = useHasPermission();
  const canWhitelist = can('server:players:whitelist');
  const { addToast } = useToast();
  const [kickDialogOpen, setKickDialogOpen] = useState(false);
  const [kickReason, setKickReason] = useState('');
  const [banDialogOpen, setBanDialogOpen] = useState(false);
  const [banReason, setBanReason] = useState('');
  const handleKick = () => {
    const cmd = kickReason.trim() ? `kick ${playerName} ${kickReason.trim()}` : `kick ${playerName}`;
    sendCommand(cmd);
    setKickDialogOpen(false);
    setKickReason('');
    addToast({ type: 'success', title: t('players.kickSent', { name: playerName }) });
  };
  const handleBan = () => {
    const cmd = banReason.trim() ? `ban ${playerName} ${banReason.trim()}` : `ban ${playerName}`;
    sendCommand(cmd);
    setBanDialogOpen(false);
    setBanReason('');
    addToast({ type: 'success', title: t('players.banSent', { name: playerName }) });
  };
  const handleOp = () => {
    sendCommand(`op ${playerName}`);
    addToast({ type: 'success', title: t('players.opSent', { name: playerName }) });
  };
  const handleDeop = () => {
    sendCommand(`deop ${playerName}`);
    addToast({ type: 'success', title: t('players.deopSent', { name: playerName }) });
  };
  const handleGamemode = (mode: string) => {
    sendCommand(`gamemode ${mode} ${playerName}`);
    addToast({ type: 'success', title: t('players.gamemodeSent', { name: playerName, mode }) });
  };
  const GAMEMODES = ['survival', 'creative', 'adventure', 'spectator'] as const;
  return (
    <>
      {canWhitelist && (
        <TooltipProvider delayDuration={300}>
          <div className={'flex items-center gap-1'}>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant={'ghost'} size={'icon-sm'} onClick={() => setKickDialogOpen(true)} icon={LogOut} iconClass={'size-3.5 text-amber-500'} />
              </TooltipTrigger>
              <TooltipContent>{t('players.kick')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant={'ghost'} size={'icon-sm'} onClick={() => setBanDialogOpen(true)} icon={Ban} iconClass={'size-3.5 text-red-500'} />
              </TooltipTrigger>
              <TooltipContent>{t('players.ban')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant={'ghost'} size={'icon-sm'} onClick={handleOp} icon={ShieldCheck} iconClass={'size-3.5 text-green-500'} />
              </TooltipTrigger>
              <TooltipContent>{t('players.op')}</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant={'ghost'} size={'icon-sm'} onClick={handleDeop} icon={ShieldOff} iconClass={'size-3.5 text-zinc-400'} />
              </TooltipTrigger>
              <TooltipContent>{t('players.deop')}</TooltipContent>
            </Tooltip>
            <DropdownMenu>
              <Tooltip>
                <TooltipTrigger asChild>
                  <DropdownMenuTrigger asChild>
                    <Button variant={'ghost'} size={'icon-sm'} icon={Gamepad2} iconClass={'size-3.5 text-blue-500'} />
                  </DropdownMenuTrigger>
                </TooltipTrigger>
                <TooltipContent>{t('players.gamemode')}</TooltipContent>
              </Tooltip>
              <DropdownMenuContent align={'end'}>
                {GAMEMODES.map((mode) => (
                  <DropdownMenuItem key={mode} onClick={() => handleGamemode(mode)}>
                    {t(`players.gamemode_${mode}`)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </TooltipProvider>
      )}
      <Dialog open={kickDialogOpen} onOpenChange={setKickDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('players.kickConfirm')}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <p className={'mb-3 text-sm text-zinc-600 dark:text-zinc-400'}>{playerName}</p>
            <Input
              type={'text'}
              value={kickReason}
              onChange={(e) => setKickReason(e.target.value)}
              placeholder={t('players.reason')}
            />
          </DialogBody>
          <DialogFooter>
            <Button variant={'ghost'} onClick={() => setKickDialogOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button variant={'destructive'} onClick={handleKick}>
              {t('players.kick')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
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
              placeholder={t('players.reason')}
            />
          </DialogBody>
          <DialogFooter>
            <Button variant={'ghost'} onClick={() => setBanDialogOpen(false)}>
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

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Clock, Info, Plus, Shield, Trash2 } from 'lucide-react';
import { cn } from '@shulkr/frontend/lib/cn';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Badge } from '@shulkr/frontend/features/ui/shadcn/badge';
import { Switch } from '@shulkr/frontend/features/ui/shadcn/switch';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';
import { PasswordGate } from '@shulkr/frontend/features/password_gate';
import {
  useFirewallRules,
  useAddFirewallRule,
  useRemoveFirewallRule,
  useToggleFirewallRule,
} from '@shulkr/frontend/hooks/use_firewall';
import { AddFirewallRuleDialog } from '@shulkr/frontend/pages/app/settings/dialogs/add_firewall_rule_dialog';
import { FirewallGuidelinesDialog } from '@shulkr/frontend/pages/app/settings/dialogs/firewall_guidelines_dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shulkr/frontend/features/ui/shadcn/tooltip';
import { useHasPermission } from '@shulkr/frontend/hooks/use_permissions';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';
import type { FirewallRule } from '@shulkr/frontend/pages/app/settings/features/firewall_constants';
import { PROTOCOL_LABELS } from '@shulkr/frontend/pages/app/settings/features/firewall_constants';

export function SettingsFirewallPage() {
  const { t } = useTranslation();

  usePageTitle('shulkr • ' + t('nav.settingsFirewall'));

  return (
    <PageContent>
      <FeatureCard.Stack>
        <FirewallListSection />
      </FeatureCard.Stack>
    </PageContent>
  );
}

function FirewallListSection() {
  const { t } = useTranslation();

  const can = useHasPermission();
  const canAdd = can('settings:firewall:add');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [guidelinesOpen, setGuidelinesOpen] = useState(false);

  const { data: firewallData } = useFirewallRules();
  const addFirewallRule = useAddFirewallRule();
  const removeFirewallRule = useRemoveFirewallRule();
  const toggleFirewallRule = useToggleFirewallRule();

  const rules: Array<FirewallRule> = firewallData?.rules ?? [];
  const activeCount = rules.filter((r) => r.enabled).length;

  return (
    <>
      <FeatureCard>
        <FeatureCard.Header>
          <FeatureCard.Content>
            <div className={'flex items-center justify-start gap-2'}>
              <FeatureCard.Title count={rules.length > 0 && `${activeCount}/${rules.length}`}>
                {t('settings.firewall.title')}
              </FeatureCard.Title>
              <Button onClick={() => setGuidelinesOpen(true)} variant={'ghost'} size={'icon-xs'}>
                <Info className={'size-3'} />
              </Button>
            </div>
            <FeatureCard.Description>{t('settings.firewall.description')}</FeatureCard.Description>
          </FeatureCard.Content>
          {canAdd && (
            <FeatureCard.Actions>
              <Button onClick={() => setDialogOpen(true)}>
                <Plus className={'size-4'} />
                {t('settings.firewall.addRule')}
              </Button>
            </FeatureCard.Actions>
          )}
        </FeatureCard.Header>
        <FeatureCard.Body>
          {rules.length === 0 ? (
            <FeatureCard.Empty
              icon={Clock}
              title={t('settings.firewall.noRules')}
              description={t('settings.firewall.noRulesHint')}
            />
          ) : (
            <>
              {rules.map((rule) => (
                <RuleRow
                  key={rule.id}
                  onToggle={(ruleId) => toggleFirewallRule.mutateAsync(ruleId)}
                  onDelete={(ruleId) => removeFirewallRule.mutateAsync(ruleId)}
                  {...{ rule }}
                />
              ))}
            </>
          )}
        </FeatureCard.Body>
      </FeatureCard>
      <AddFirewallRuleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onAdd={(rule) => {
          addFirewallRule.mutateAsync(rule);
          setDialogOpen(false);
        }}
        existingRules={rules}
      />
      <FirewallGuidelinesDialog open={guidelinesOpen} onOpenChange={setGuidelinesOpen} />
    </>
  );
}

type RuleRowProps = {
  rule: FirewallRule;
  onToggle: (id: number) => void | Promise<unknown>;
  onDelete: (id: number) => void | Promise<unknown>;
};

function RuleRow({ rule, onToggle, onDelete }: RuleRowProps) {
  const { t } = useTranslation();
  const can = useHasPermission();
  const canToggle = can('settings:firewall:toggle');
  const canRemove = can('settings:firewall:remove');
  const [toggleConfirm, setToggleConfirm] = useState(false);
  const [gateRuleId, setGateRuleId] = useState<number | null>(null);

  function handleToggleChange() {
    if (toggleConfirm) return;
    setToggleConfirm(true);
  }

  function handleToggleConfirm() {
    onToggle(rule.id);
    setToggleConfirm(false);
  }

  return (
    <>
      <FeatureCard.Row interactive className={'items-center gap-8 py-3'}>
        <div className={cn('flex items-center gap-3', !rule.enabled && 'opacity-50')}>
          <div
            className={cn(
              'flex size-8 shrink-0 items-center justify-center rounded-lg transition-opacity',
              rule.enabled ? 'bg-blue-600 text-white' : 'bg-zinc-300'
            )}
          >
            <Shield className={'size-4'} strokeWidth={2} />
          </div>
          <div className={'min-w-0'}>
            <div className={'flex items-center gap-2'}>
              <span className={'font-jetbrains text-sm font-medium text-zinc-800 tabular-nums dark:text-zinc-200'}>
                {rule.port}
              </span>
              <Badge>{PROTOCOL_LABELS[rule.protocol]}</Badge>
              <span className={'text-sm text-zinc-600 dark:text-zinc-400'}>{rule.label}</span>
              {!rule.enabled && <Badge variant={'secondary'}>{t('settings.firewall.disabled')}</Badge>}
            </div>
          </div>
        </div>
        <FeatureCard.RowControl>
          {toggleConfirm ? (
            <div className={'flex items-center gap-1.5'}>
              <span className={'text-sm text-zinc-600 dark:text-zinc-400'}>{t('common.confirm')}?</span>
              <Button onClick={handleToggleConfirm} variant={rule.enabled ? 'secondary' : 'success'} size={'xs'}>
                {t('common.yes')}
              </Button>
              <Button onClick={() => setToggleConfirm(false)} variant={'ghost'} size={'xs'}>
                {t('common.no')}
              </Button>
            </div>
          ) : (
            <>
              <TooltipProvider delayDuration={300}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={'flex items-center'}>
                      <Switch
                        checked={rule.enabled}
                        onCheckedChange={handleToggleChange}
                        disabled={!canToggle}
                      />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent className={'rounded-lg px-2.5 py-1.5 text-sm'}>
                    {rule.enabled ? t('rules.tooltipDisable') : t('rules.tooltipEnable')}
                  </TooltipContent>
                </Tooltip>
                {canRemove && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button onClick={() => setGateRuleId(rule.id)} variant={'ghost-destructive'} size={'icon-sm'}>
                        <Trash2 className={'size-4'} />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent className={'rounded-lg px-2.5 py-1.5 text-sm'}>{t('rules.tooltipDelete')}</TooltipContent>
                  </Tooltip>
                )}
              </TooltipProvider>
            </>
          )}
        </FeatureCard.RowControl>
      </FeatureCard.Row>
      <PasswordGate
        open={gateRuleId !== null}
        onOpenChange={(open) => !open && setGateRuleId(null)}
        title={t('rules.tooltipDelete')}
        description={t('settings.firewall.deleteRuleDescription')}
        confirmLabel={t('rules.tooltipDelete')}
        destructive
        onConfirm={async () => {
          if (gateRuleId !== null) await onDelete(gateRuleId);
        }}
      />
    </>
  );
}

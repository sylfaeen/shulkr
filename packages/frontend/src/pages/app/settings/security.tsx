import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@shulkr/frontend/features/ui/base/tabs';
import { FirewallListSection } from '@shulkr/frontend/pages/app/settings/features/firewall_section';
import { GlobalIpBansSection } from '@shulkr/frontend/pages/app/settings/features/ip_bans_section';
import { useHasPermission } from '@shulkr/frontend/hooks/use_permissions';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';

type SecurityTab = 'firewall' | 'ip-bans';

export function SettingsSecurityPage() {
  const { t } = useTranslation();

  const can = useHasPermission();
  const canFirewall = can('settings:firewall:list');
  const canIpBans = can('settings:globalIpBans:list');

  const initialTab: SecurityTab = canFirewall ? 'firewall' : 'ip-bans';
  const [tab, setTab] = useState<SecurityTab>(initialTab);

  usePageTitle('shulkr • ' + t('nav.settingsSecurity'));

  return (
    <PageContent>
      <Tabs value={tab} onValueChange={(value) => setTab(value as SecurityTab)}>
        <TabsList>
          {canFirewall && <TabsTrigger value={'firewall'}>{t('settings.security.tabFirewall')}</TabsTrigger>}
          {canIpBans && <TabsTrigger value={'ip-bans'}>{t('settings.security.tabIpBans')}</TabsTrigger>}
        </TabsList>
        {canFirewall && (
          <TabsContent value={'firewall'}>
            <FeatureCard.Stack>
              <FirewallListSection />
            </FeatureCard.Stack>
          </TabsContent>
        )}
        {canIpBans && (
          <TabsContent value={'ip-bans'}>
            <FeatureCard.Stack>
              <GlobalIpBansSection />
            </FeatureCard.Stack>
          </TabsContent>
        )}
      </Tabs>
    </PageContent>
  );
}

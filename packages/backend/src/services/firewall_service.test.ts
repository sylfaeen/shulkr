import { describe, it, expect } from 'vitest';
import {
  listFirewallRules,
  addFirewallRule,
  removeFirewallRule,
  removeFirewallRuleByPort,
  toggleFirewallRule,
  checkFirewallPort,
  syncFirewallRules,
} from '@shulkr/backend/services/firewall_service';

describe('firewall_service', () => {
  it('exposes the function-injection surface', () => {
    expect(typeof listFirewallRules).toBe('function');
    expect(typeof addFirewallRule).toBe('function');
    expect(typeof removeFirewallRule).toBe('function');
    expect(typeof removeFirewallRuleByPort).toBe('function');
    expect(typeof toggleFirewallRule).toBe('function');
    expect(typeof checkFirewallPort).toBe('function');
    expect(typeof syncFirewallRules).toBe('function');
  });
});

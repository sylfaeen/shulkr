import { initServer } from '@ts-rest/fastify';
import { contract, ErrorCodes } from '@shulkr/shared';
import {
  addFirewallRule,
  checkFirewallPort,
  listFirewallRules,
  removeFirewallRule,
  toggleFirewallRule,
} from '@shulkr/backend/services/firewall_service';
import { logAuditAction } from '@shulkr/backend/services/audit_service';
import { authenticate, assertPermissions, checkRateLimit, isMiddlewareError } from '@shulkr/backend/api/middleware';
import { getAppDeps } from '@shulkr/backend/deps';

const s = initServer();
const ONE_MINUTE = 60_000;

export const firewallRoutes = s.router(contract.firewall, {
  list: async ({ request }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'settings:firewall:list');
      const rules = await listFirewallRules(getAppDeps());
      return { status: 200 as const, body: { rules } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  add: async ({ request, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'settings:firewall:add');
      checkRateLimit(`user:${user.sub}:firewall.add`, 10, ONE_MINUTE);
      const rule = await addFirewallRule(getAppDeps(), body.port, body.protocol, body.label);
      await logAuditAction(getAppDeps(), {
        userId: user.sub,
        username: user.username,
        action: 'add',
        resourceType: 'firewall',
        resourceId: String(rule.id),
        details: { port: body.port, protocol: body.protocol, label: body.label },
        ip: request.ip,
      });
      return { status: 201 as const, body: rule };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      if (error instanceof Error) {
        if (error.message === ErrorCodes.FIREWALL_RULE_EXISTS) {
          return { status: 200 as const, body: { message: 'Port/protocol combination already exists' } };
        }
        if (error.message === ErrorCodes.FIREWALL_SCRIPT_FAILED) {
          return { status: 200 as const, body: { message: 'Firewall script failed to open port' } };
        }
        if (error.message === ErrorCodes.FIREWALL_PORT_RESERVED) {
          return { status: 200 as const, body: { message: 'Port is reserved and cannot be used' } };
        }
      }
      throw error;
    }
  },
  remove: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'settings:firewall:remove');
      checkRateLimit(`user:${user.sub}:firewall.remove`, 10, ONE_MINUTE);
      const ruleId = Number(params.ruleId);
      await removeFirewallRule(getAppDeps(), ruleId);
      await logAuditAction(getAppDeps(), {
        userId: user.sub,
        username: user.username,
        action: 'remove',
        resourceType: 'firewall',
        resourceId: String(ruleId),
        ip: request.ip,
      });
      return { status: 200 as const, body: { message: 'Rule removed' } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      if (error instanceof Error) {
        if (error.message === ErrorCodes.FIREWALL_RULE_NOT_FOUND) {
          return { status: 200 as const, body: { message: 'Firewall rule not found' } };
        }
        if (error.message === ErrorCodes.FIREWALL_SCRIPT_FAILED) {
          return { status: 200 as const, body: { message: 'Firewall script failed to close port' } };
        }
      }
      return { status: 200 as const, body: { message: 'Failed to remove firewall rule' } };
    }
  },
  toggle: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'settings:firewall:toggle');
      checkRateLimit(`user:${user.sub}:firewall.toggle`, 10, ONE_MINUTE);
      const ruleId = Number(params.ruleId);
      const result = await toggleFirewallRule(getAppDeps(), ruleId);
      await logAuditAction(getAppDeps(), {
        userId: user.sub,
        username: user.username,
        action: 'toggle',
        resourceType: 'firewall',
        resourceId: String(ruleId),
        ip: request.ip,
      });
      return { status: 200 as const, body: result };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  check: async ({ request, query }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'settings:firewall:list');
      const open = await checkFirewallPort(getAppDeps(), query.port, query.protocol);
      return { status: 200 as const, body: { open } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
});

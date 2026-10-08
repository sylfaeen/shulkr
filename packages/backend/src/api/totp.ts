import { initServer } from '@ts-rest/fastify';
import { contract, ErrorCodes } from '@shulkr/shared';
import {
  isTotpEnabled,
  generateTotpSetup,
  verifyTotpCode,
  activateTotp,
  disableTotp,
} from '@shulkr/backend/services/totp_service';
import { logAuditAction } from '@shulkr/backend/services/audit_service';
import { withAuthOnly } from '@shulkr/backend/api/_shared';
import type { AppDeps } from '@shulkr/backend/deps';

const s = initServer();

export function createTotpRoutes(deps: AppDeps) {
  return s.router(contract.totp, {
    status: ({ request }) =>
      withAuthOnly(request, async (user) => {
        const enabled = await isTotpEnabled(deps, user.sub);

        return { status: 200 as const, body: { enabled } };
      }),

    setup: ({ request }) =>
      withAuthOnly(request, async (user) => {
        const enabled = await isTotpEnabled(deps, user.sub);

        if (enabled) {
          return {
            status: 401 as const,
            body: { code: ErrorCodes.TOTP_ALREADY_ENABLED, message: ErrorCodes.TOTP_ALREADY_ENABLED },
          };
        }

        const result = await generateTotpSetup(deps, user.sub);

        return { status: 200 as const, body: result };
      }),

    verify: ({ request, body }) =>
      withAuthOnly(request, async (user) => {
        const activated = await activateTotp(deps, user.sub, body.code);

        if (!activated) {
          return { status: 401 as const, body: { code: ErrorCodes.TOTP_INVALID_CODE, message: ErrorCodes.TOTP_INVALID_CODE } };
        }

        await logAuditAction(deps, {
          userId: user.sub,
          username: user.username,
          action: 'totp_enabled',
          resourceType: 'totp',
          ip: request.ip,
        });

        return { status: 200 as const, body: { success: true as const } };
      }),

    disable: ({ request, body }) =>
      withAuthOnly(request, async (user) => {
        const enabled = await isTotpEnabled(deps, user.sub);

        if (!enabled) {
          return { status: 401 as const, body: { code: ErrorCodes.TOTP_NOT_ENABLED, message: ErrorCodes.TOTP_NOT_ENABLED } };
        }

        const isValid = await verifyTotpCode(deps, user.sub, body.code);

        if (!isValid) {
          return { status: 401 as const, body: { code: ErrorCodes.TOTP_INVALID_CODE, message: ErrorCodes.TOTP_INVALID_CODE } };
        }

        await disableTotp(deps, user.sub);

        await logAuditAction(deps, {
          userId: user.sub,
          username: user.username,
          action: 'totp_disabled',
          resourceType: 'totp',
          ip: request.ip,
        });

        return { status: 200 as const, body: { success: true as const } };
      }),
  });
}

import { initServer } from '@ts-rest/fastify';
import { contract, ErrorCodes } from '@shulkr/shared';
import { totpService } from '@shulkr/backend/services/totp_service';
import { auditService } from '@shulkr/backend/services/audit_service';
import { authenticate, isMiddlewareError } from './middleware';

const s = initServer();

export const totpRoutes = s.router(contract.totp, {
  status: async ({ request }) => {
    try {
      const user = await authenticate(request);
      const enabled = await totpService.isTotpEnabled(user.sub);
      return { status: 200 as const, body: { enabled } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  setup: async ({ request }) => {
    try {
      const user = await authenticate(request);
      const isEnabled = await totpService.isTotpEnabled(user.sub);

      if (isEnabled) {
        return {
          status: 401 as const,
          body: { code: ErrorCodes.TOTP_ALREADY_ENABLED, message: ErrorCodes.TOTP_ALREADY_ENABLED },
        };
      }

      const result = await totpService.generateTotpSetup(user.sub);
      return { status: 200 as const, body: result };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  verify: async ({ request, body }) => {
    try {
      const user = await authenticate(request);
      const activated = await totpService.activateTotp(user.sub, body.code);

      if (!activated) {
        return { status: 401 as const, body: { code: ErrorCodes.TOTP_INVALID_CODE, message: ErrorCodes.TOTP_INVALID_CODE } };
      }

      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'totp_enabled',
        resourceType: 'totp',
        ip: request.ip,
      });

      return { status: 200 as const, body: { success: true as const } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  disable: async ({ request, body }) => {
    try {
      const user = await authenticate(request);
      const isEnabled = await totpService.isTotpEnabled(user.sub);

      if (!isEnabled) {
        return { status: 401 as const, body: { code: ErrorCodes.TOTP_NOT_ENABLED, message: ErrorCodes.TOTP_NOT_ENABLED } };
      }

      const isValid = await totpService.verifyTotpCode(user.sub, body.code);
      if (!isValid) {
        return { status: 401 as const, body: { code: ErrorCodes.TOTP_INVALID_CODE, message: ErrorCodes.TOTP_INVALID_CODE } };
      }

      await totpService.disableTotp(user.sub);

      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'totp_disabled',
        resourceType: 'totp',
        ip: request.ip,
      });

      return { status: 200 as const, body: { success: true as const } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
});

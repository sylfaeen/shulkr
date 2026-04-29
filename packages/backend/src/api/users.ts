import { initServer } from '@ts-rest/fastify';
import { contract, ErrorCodes } from '@shulkr/shared';
import { getAllUsers, getUserById, createUser, updateUser, deleteUser } from '@shulkr/backend/services/user_service';
import { logAuditAction } from '@shulkr/backend/services/audit_service';
import { checkRateLimit } from '@shulkr/backend/services/rate_limit_service';
import { withAuth, withAuthOnly } from '@shulkr/backend/api/_shared';
import type { AppDeps } from '@shulkr/backend/deps';

const s = initServer();
const ONE_MINUTE = 60_000;

export function createUsersRoutes(deps: AppDeps) {
  return s.router(contract.users, {
    list: ({ request }) =>
      withAuth(request, 'users:manage:list', async () => {
        const result = await getAllUsers(deps);
        return { status: 200, body: result };
      }),

    byId: ({ request, params }) =>
      withAuth(request, 'users:manage:list', async () => {
        const found = await getUserById(deps, Number(params.id));
        if (!found) {
          return { status: 404, body: { code: ErrorCodes.USER_NOT_FOUND, message: ErrorCodes.USER_NOT_FOUND } };
        }
        return { status: 200, body: found };
      }),

    create: ({ request, body }) =>
      withAuth(request, 'users:manage:create', async (user) => {
        checkRateLimit(`user:${user.sub}:users.create`, 10, ONE_MINUTE);

        const result = await createUser(deps, body);
        if (!result.success) {
          if (result.error === ErrorCodes.USER_ALREADY_EXISTS) {
            return { status: 409, body: { code: ErrorCodes.USER_ALREADY_EXISTS, message: ErrorCodes.USER_ALREADY_EXISTS } };
          }
          return { status: 409, body: { code: ErrorCodes.INTERNAL_ERROR, message: ErrorCodes.INTERNAL_ERROR } };
        }

        await logAuditAction(deps, {
          userId: user.sub,
          username: user.username,
          action: 'create',
          resourceType: 'user',
          resourceId: String(result.user!.id),
          details: { username: body.username },
          ip: request.ip,
        });

        return { status: 201, body: result.user };
      }),

    update: ({ request, params, body }) =>
      withAuth(request, 'users:manage:update', async (user) => {
        checkRateLimit(`user:${user.sub}:users.update`, 10, ONE_MINUTE);

        const id = Number(params.id);
        if (user.sub === id && body.permissions !== undefined) {
          const currentPerms = JSON.stringify([...user.permissions].sort());
          const newPerms = JSON.stringify([...body.permissions].sort());
          if (currentPerms !== newPerms) {
            return {
              status: 403 as const,
              body: {
                code: ErrorCodes.USER_CANNOT_EDIT_OWN_PERMISSIONS,
                message: ErrorCodes.USER_CANNOT_EDIT_OWN_PERMISSIONS,
              },
            };
          }
        }

        const result = await updateUser(deps, id, body);
        if (!result.success) {
          if (result.error === ErrorCodes.USER_NOT_FOUND) {
            return { status: 404, body: { code: ErrorCodes.USER_NOT_FOUND, message: ErrorCodes.USER_NOT_FOUND } };
          }
          if (result.error === ErrorCodes.USER_ALREADY_EXISTS) {
            return { status: 409, body: { code: ErrorCodes.USER_ALREADY_EXISTS, message: ErrorCodes.USER_ALREADY_EXISTS } };
          }
          return { status: 409, body: { code: ErrorCodes.INTERNAL_ERROR, message: ErrorCodes.INTERNAL_ERROR } };
        }

        const fields = Object.keys(body).filter((k) => body[k as keyof typeof body] !== undefined);
        await logAuditAction(deps, {
          userId: user.sub,
          username: user.username,
          action: 'update',
          resourceType: 'user',
          resourceId: String(id),
          details: { fields },
          ip: request.ip,
        });

        return { status: 200, body: result.user };
      }),

    updateLocale: ({ request, body }) =>
      withAuthOnly(request, async (user) => {
        const result = await updateUser(deps, user.sub, { locale: body.locale });
        if (!result.success) {
          return { status: 401 as const, body: { code: ErrorCodes.USER_NOT_FOUND, message: ErrorCodes.USER_NOT_FOUND } };
        }
        return { status: 200 as const, body: result.user };
      }),

    delete: ({ request, params }) =>
      withAuth(request, 'users:manage:delete', async (user) => {
        checkRateLimit(`user:${user.sub}:users.delete`, 10, ONE_MINUTE);

        const id = Number(params.id);
        if (id === 1) {
          return { status: 403 as const, body: { code: ErrorCodes.USER_PROTECTED, message: ErrorCodes.USER_PROTECTED } };
        }

        const result = await deleteUser(deps, id, user.sub);
        if (!result.success) {
          if (result.error === ErrorCodes.USER_NOT_FOUND) {
            return { status: 404, body: { code: ErrorCodes.USER_NOT_FOUND, message: ErrorCodes.USER_NOT_FOUND } };
          }
          if (result.error === ErrorCodes.USER_CANNOT_DELETE_SELF) {
            return {
              status: 404,
              body: { code: ErrorCodes.USER_CANNOT_DELETE_SELF, message: ErrorCodes.USER_CANNOT_DELETE_SELF },
            };
          }
          return { status: 404, body: { code: ErrorCodes.INTERNAL_ERROR, message: ErrorCodes.INTERNAL_ERROR } };
        }

        await logAuditAction(deps, {
          userId: user.sub,
          username: user.username,
          action: 'delete',
          resourceType: 'user',
          resourceId: String(id),
          ip: request.ip,
        });

        return { status: 200, body: { message: 'User deleted successfully' } };
      }),
  });
}

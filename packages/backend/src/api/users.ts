import { initServer } from '@ts-rest/fastify';
import { contract } from '@shulkr/shared';
import { UserService } from '@shulkr/backend/services/user_service';
import { auditService } from '@shulkr/backend/services/audit_service';
import { ErrorCodes } from '@shulkr/shared';
import { authenticate, assertPermissions, checkRateLimit, isMiddlewareError } from '@shulkr/backend/api/middleware';

const s = initServer();
const userService = new UserService();
const ONE_MINUTE = 60_000;

export const usersRoutes = s.router(contract.users, {
  list: async ({ request }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'users:manage:list');
      const result = await userService.getAllUsers();
      return { status: 200, body: result };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  byId: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'users:manage:list');
      const found = await userService.getUserById(Number(params.id));
      if (!found) {
        return { status: 404, body: { code: ErrorCodes.USER_NOT_FOUND, message: ErrorCodes.USER_NOT_FOUND } };
      }
      return { status: 200, body: found };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  create: async ({ request, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'users:manage:create');
      checkRateLimit(`user:${user.sub}:users.create`, 10, ONE_MINUTE);
      const result = await userService.createUser(body);
      if (!result.success) {
        if (result.error === ErrorCodes.USER_ALREADY_EXISTS) {
          return { status: 409, body: { code: ErrorCodes.USER_ALREADY_EXISTS, message: ErrorCodes.USER_ALREADY_EXISTS } };
        }
        return { status: 409, body: { code: ErrorCodes.INTERNAL_ERROR, message: ErrorCodes.INTERNAL_ERROR } };
      }
      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'create',
        resourceType: 'user',
        resourceId: String(result.user!.id),
        details: { username: body.username },
        ip: request.ip,
      });
      return { status: 201, body: result.user };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  update: async ({ request, params, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'users:manage:update');
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
      const result = await userService.updateUser(id, body);
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
      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'update',
        resourceType: 'user',
        resourceId: String(id),
        details: { fields },
        ip: request.ip,
      });
      return { status: 200, body: result.user };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  updateLocale: async ({ request, body }) => {
    try {
      const user = await authenticate(request);
      const result = await userService.updateUser(user.sub, { locale: body.locale });
      if (!result.success) {
        return { status: 401 as const, body: { code: ErrorCodes.USER_NOT_FOUND, message: ErrorCodes.USER_NOT_FOUND } };
      }
      return { status: 200 as const, body: result.user };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  delete: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'users:manage:delete');
      checkRateLimit(`user:${user.sub}:users.delete`, 10, ONE_MINUTE);
      const id = Number(params.id);
      // Prevent deleting the first user (admin created at setup)
      if (id === 1) {
        return { status: 403 as const, body: { code: ErrorCodes.USER_PROTECTED, message: ErrorCodes.USER_PROTECTED } };
      }
      const result = await userService.deleteUser(id, user.sub);
      if (!result.success) {
        if (result.error === ErrorCodes.USER_NOT_FOUND) {
          return { status: 404, body: { code: ErrorCodes.USER_NOT_FOUND, message: ErrorCodes.USER_NOT_FOUND } };
        }
        if (result.error === ErrorCodes.USER_CANNOT_DELETE_SELF) {
          return { status: 404, body: { code: ErrorCodes.USER_CANNOT_DELETE_SELF, message: ErrorCodes.USER_CANNOT_DELETE_SELF } };
        }
        return { status: 404, body: { code: ErrorCodes.INTERNAL_ERROR, message: ErrorCodes.INTERNAL_ERROR } };
      }
      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'delete',
        resourceType: 'user',
        resourceId: String(id),
        ip: request.ip,
      });
      return { status: 200, body: { message: 'User deleted successfully' } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
});

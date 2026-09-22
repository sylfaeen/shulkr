import { initContract } from '@ts-rest/core';
import { z } from 'zod';
import {
  databaseColumnFilterSchema,
  databaseQueryResultSchema,
  databaseSearchMatchSchema,
  databaseTableDataResultSchema,
  databaseTableInfoSchema,
  databaseTableSchemaSchema,
  serverDatabaseSchema,
  createDatabaseSchema,
  deleteDatabaseSchema,
  databaseCredentialsSchema,
  databaseAccessSchema,
  databaseAccessCredentialsSchema,
  createDatabaseAccessSchema,
  databaseEngineStatusSchema,
} from '@shulkr/shared/schemas/database';

const c = initContract();

const errorSchema = z.object({
  code: z.string(),
  message: z.string(),
});

const messageSchema = z.object({
  message: z.string(),
});

export const databasesContract = c.router({
  engineStatus: {
    method: 'GET',
    path: '/api/databases/engine',
    responses: {
      200: databaseEngineStatusSchema,
      401: errorSchema,
      403: errorSchema,
    },
  },
  list: {
    method: 'GET',
    path: '/api/databases',
    query: z.object({
      serverId: z.string(),
    }),
    responses: {
      200: z.object({
        databases: z.array(serverDatabaseSchema),
      }),
      401: errorSchema,
      403: errorSchema,
    },
  },
  create: {
    method: 'POST',
    path: '/api/databases',
    body: createDatabaseSchema,
    responses: {
      201: z.object({
        database: serverDatabaseSchema,
        credentials: databaseCredentialsSchema,
      }),
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      409: errorSchema,
      503: errorSchema,
    },
  },
  credentials: {
    method: 'GET',
    path: '/api/databases/:id/credentials',
    pathParams: z.object({ id: z.coerce.number() }),
    responses: {
      200: databaseCredentialsSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
  },
  rotate: {
    method: 'POST',
    path: '/api/databases/:id/rotate',
    pathParams: z.object({ id: z.coerce.number() }),
    body: z.object({}),
    responses: {
      200: databaseCredentialsSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
      503: errorSchema,
    },
  },
  remove: {
    method: 'DELETE',
    path: '/api/databases/:id',
    pathParams: z.object({ id: z.coerce.number() }),
    body: deleteDatabaseSchema,
    responses: {
      200: messageSchema,
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
      503: errorSchema,
    },
  },
  tables: {
    method: 'GET',
    path: '/api/databases/:id/tables',
    pathParams: z.object({ id: z.coerce.number() }),
    responses: {
      200: z.object({ tables: z.array(databaseTableInfoSchema) }),
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
      503: errorSchema,
    },
  },
  tableSchema: {
    method: 'GET',
    path: '/api/databases/:id/tables/:table/schema',
    pathParams: z.object({ id: z.coerce.number(), table: z.string() }),
    responses: {
      200: databaseTableSchemaSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
      503: errorSchema,
    },
  },
  tableData: {
    method: 'POST',
    path: '/api/databases/:id/tables/:table/data',
    pathParams: z.object({ id: z.coerce.number(), table: z.string() }),
    body: z.object({
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(500).default(100),
      orderBy: z.string().optional(),
      direction: z.enum(['ASC', 'DESC']).optional(),
      filters: z.array(databaseColumnFilterSchema).default([]),
    }),
    responses: {
      200: databaseTableDataResultSchema,
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
      503: errorSchema,
    },
  },
  query: {
    method: 'POST',
    path: '/api/databases/:id/query',
    pathParams: z.object({ id: z.coerce.number() }),
    body: z.object({ sql: z.string().min(1) }),
    responses: {
      200: databaseQueryResultSchema,
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
      503: errorSchema,
    },
  },
  search: {
    method: 'POST',
    path: '/api/databases/:id/search',
    pathParams: z.object({ id: z.coerce.number() }),
    body: z.object({ term: z.string().min(2), tables: z.array(z.string()) }),
    responses: {
      200: z.object({ matches: z.array(databaseSearchMatchSchema) }),
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
      503: errorSchema,
    },
  },
  listAccesses: {
    method: 'GET',
    path: '/api/databases/:id/accesses',
    pathParams: z.object({ id: z.coerce.number() }),
    responses: {
      200: z.object({
        accesses: z.array(databaseAccessSchema),
      }),
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
  },
  createAccess: {
    method: 'POST',
    path: '/api/databases/:id/accesses',
    pathParams: z.object({ id: z.coerce.number() }),
    body: createDatabaseAccessSchema,
    responses: {
      201: z.object({
        access: databaseAccessSchema,
        credentials: databaseAccessCredentialsSchema,
        engineRestarted: z.boolean(),
      }),
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
      409: errorSchema,
      503: errorSchema,
    },
  },
  accessCredentials: {
    method: 'GET',
    path: '/api/databases/:id/accesses/:accessId/credentials',
    pathParams: z.object({ id: z.coerce.number(), accessId: z.coerce.number() }),
    responses: {
      200: databaseAccessCredentialsSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
    },
  },
  rotateAccess: {
    method: 'POST',
    path: '/api/databases/:id/accesses/:accessId/rotate',
    pathParams: z.object({ id: z.coerce.number(), accessId: z.coerce.number() }),
    body: z.object({}),
    responses: {
      200: databaseAccessCredentialsSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
      503: errorSchema,
    },
  },
  reissueAccessCertificate: {
    method: 'POST',
    path: '/api/databases/:id/accesses/:accessId/certificate',
    pathParams: z.object({ id: z.coerce.number(), accessId: z.coerce.number() }),
    body: z.object({}),
    responses: {
      200: z.object({ clientCertificate: z.string(), clientKey: z.string() }),
      400: errorSchema,
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
      503: errorSchema,
    },
  },
  revokeAccess: {
    method: 'DELETE',
    path: '/api/databases/:id/accesses/:accessId',
    pathParams: z.object({ id: z.coerce.number(), accessId: z.coerce.number() }),
    responses: {
      200: z.object({
        message: z.string(),
        engineRestarted: z.boolean(),
      }),
      401: errorSchema,
      403: errorSchema,
      404: errorSchema,
      503: errorSchema,
    },
  },
});

import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import { serverProcessManager } from '@shulkr/backend/services/server_process_manager';
import { metricsService } from '@shulkr/backend/services/metrics_service';
import { playersService } from '@shulkr/backend/services/players_service';
import type { PlayersUpdate } from '@shulkr/shared';
import { eq } from 'drizzle-orm';
import type { Permission } from '@shulkr/shared';
import { db } from '@shulkr/backend/db';
import { users } from '@shulkr/backend/db/schema';
import { auditService } from '@shulkr/backend/services/audit_service';

function hasPermission(userPermissions: Array<string>, required: Permission): boolean {
  return userPermissions.includes('*') || userPermissions.includes(required);
}

interface JWTPayload {
  sub: number;
  username: string;
  permissions: Array<string>;
  token_version: number;
}

interface ConsoleOutputEvent {
  serverId: string;
  type: 'stdout' | 'stderr';
  data: string;
  level?: string;
  logTime?: string;
}

interface WebSocketMessage {
  type: string;
  serverId?: string;
  command?: string;
  offset?: number;
  limit?: number;
}

const serverConnections = new Map<string, Set<WebSocket>>();

const metricsSubscriptions = new Map<string, Set<WebSocket>>();

const METRICS_POLL_INTERVAL = 5000;
const WS_MESSAGE_RATE_LIMIT = 30;
const WS_MESSAGE_RATE_WINDOW = 1000;
const INITIAL_HISTORY_LIMIT = 100;
const CONSOLE_BATCH_INTERVAL_MS = 100;

const metricsIntervals = new Map<string, NodeJS.Timeout>();

function startMetricsPolling(serverId: string) {
  if (metricsIntervals.has(serverId)) {
    return;
  }

  const interval = setInterval(async () => {
    const subscribers = metricsSubscriptions.get(serverId);
    if (!subscribers || subscribers.size === 0) {
      stopMetricsPolling(serverId);
      return;
    }

    const metrics = await metricsService.getServerMetrics(serverId);
    if (!metrics) {
      const message = JSON.stringify({
        type: 'metrics:update',
        server_id: serverId,
        metrics: null,
        timestamp: Date.now(),
      });

      subscribers.forEach((socket) => {
        if (socket.readyState === 1) {
          socket.send(message);
        }
      });
      return;
    }

    const message = JSON.stringify({
      type: 'metrics:update',
      server_id: serverId,
      metrics,
      timestamp: Date.now(),
    });

    subscribers.forEach((socket) => {
      if (socket.readyState === 1) {
        socket.send(message);
      }
    });
  }, METRICS_POLL_INTERVAL);

  metricsIntervals.set(serverId, interval);
}

function stopMetricsPolling(serverId: string) {
  const interval = metricsIntervals.get(serverId);
  if (interval) {
    clearInterval(interval);
    metricsIntervals.delete(serverId);
  }
}

function addMetricsSubscription(serverId: string, socket: WebSocket) {
  if (!metricsSubscriptions.has(serverId)) {
    metricsSubscriptions.set(serverId, new Set());
  }
  metricsSubscriptions.get(serverId)!.add(socket);
  startMetricsPolling(serverId);
}

function removeMetricsSubscription(serverId: string, socket: WebSocket) {
  const subscribers = metricsSubscriptions.get(serverId);
  if (subscribers) {
    subscribers.delete(socket);
    if (subscribers.size === 0) {
      metricsSubscriptions.delete(serverId);
      stopMetricsPolling(serverId);
    }
  }
}

function removeAllMetricsSubscriptions(socket: WebSocket) {
  metricsSubscriptions.forEach((subscribers, serverId) => {
    if (subscribers.has(socket)) {
      removeMetricsSubscription(serverId, socket);
    }
  });
}

// Batched console output: accumulate lines and flush every 100ms
const consoleBatchBuffers = new Map<string, Array<ConsoleOutputEvent>>();
const consoleBatchIntervals = new Map<string, NodeJS.Timeout>();

function flushConsoleBatch(serverId: string) {
  const buffer = consoleBatchBuffers.get(serverId);
  if (!buffer || buffer.length === 0) return;

  const connections = serverConnections.get(serverId);
  if (!connections || connections.size === 0) {
    consoleBatchBuffers.set(serverId, []);
    return;
  }

  if (buffer.length === 1) {
    const event = buffer[0];
    const message = JSON.stringify({
      type: 'console:output',
      serverId: event.serverId,
      outputType: event.type,
      data: event.data,
      timestamp: Date.now(),
      level: event.level,
      logTime: event.logTime,
    });
    connections.forEach((socket) => {
      if (socket.readyState === 1) socket.send(message);
    });
  } else {
    const message = JSON.stringify({
      type: 'console:batch',
      serverId,
      lines: buffer.map((event) => ({
        outputType: event.type,
        data: event.data,
        timestamp: Date.now(),
        level: event.level,
        logTime: event.logTime,
      })),
    });
    connections.forEach((socket) => {
      if (socket.readyState === 1) socket.send(message);
    });
  }

  consoleBatchBuffers.set(serverId, []);
}

function startConsoleBatching(serverId: string) {
  if (consoleBatchIntervals.has(serverId)) return;
  consoleBatchIntervals.set(
    serverId,
    setInterval(() => flushConsoleBatch(serverId), CONSOLE_BATCH_INTERVAL_MS)
  );
}

function stopConsoleBatching(serverId: string) {
  const interval = consoleBatchIntervals.get(serverId);
  if (interval) {
    clearInterval(interval);
    consoleBatchIntervals.delete(serverId);
  }
  flushConsoleBatch(serverId);
  consoleBatchBuffers.delete(serverId);
}

serverProcessManager.on('console:output', (event: ConsoleOutputEvent) => {
  playersService.parseLogLine(event.serverId, event.data);

  const connections = serverConnections.get(event.serverId);
  if (!connections || connections.size === 0) return;

  if (!consoleBatchBuffers.has(event.serverId)) {
    consoleBatchBuffers.set(event.serverId, []);
  }
  consoleBatchBuffers.get(event.serverId)!.push(event);
  startConsoleBatching(event.serverId);
});

serverProcessManager.on('server:started', ({ serverId, pid }: { serverId: string; pid: number }) => {
  const connections = serverConnections.get(serverId);
  if (!connections) return;

  const message = JSON.stringify({
    type: 'server:started',
    serverId,
    pid,
    timestamp: Date.now(),
  });

  connections.forEach((socket) => {
    if (socket.readyState === 1) {
      socket.send(message);
    }
  });
});

serverProcessManager.on(
  'server:stopped',
  ({ serverId, code, signal }: { serverId: string; code: number | null; signal: string | null }) => {
    playersService.clearPlayers(serverId);
    metricsService.invalidateCache(serverId);

    const connections = serverConnections.get(serverId);
    if (!connections) return;

    const message = JSON.stringify({
      type: 'server:stopped',
      serverId,
      code,
      signal,
      timestamp: Date.now(),
    });

    connections.forEach((socket) => {
      if (socket.readyState === 1) {
        socket.send(message);
      }
    });
  }
);

playersService.on('server:players', (update: PlayersUpdate) => {
  const connections = serverConnections.get(update.server_id);
  if (!connections) return;

  const message = JSON.stringify({
    type: 'server:players',
    server_id: update.server_id,
    players: update.players,
    playerDetails: update.playerDetails,
    count: update.count,
    timestamp: update.timestamp,
  });

  connections.forEach((socket) => {
    if (socket.readyState === 1) {
      socket.send(message);
    }
  });
});

serverProcessManager.on('server:error', ({ serverId, error }: { serverId: string; error: string }) => {
  const connections = serverConnections.get(serverId);
  if (!connections) return;

  const message = JSON.stringify({
    type: 'server:error',
    serverId,
    error,
    timestamp: Date.now(),
  });

  connections.forEach((socket) => {
    if (socket.readyState === 1) {
      socket.send(message);
    }
  });
});

function addConnection(serverId: string, socket: WebSocket) {
  if (!serverConnections.has(serverId)) {
    serverConnections.set(serverId, new Set());
  }
  serverConnections.get(serverId)!.add(socket);
}

function removeConnection(serverId: string, socket: WebSocket) {
  const connections = serverConnections.get(serverId);
  if (connections) {
    connections.delete(socket);
    if (connections.size === 0) {
      serverConnections.delete(serverId);
      stopConsoleBatching(serverId);
    }
  }
}

export async function registerWebSocketRoutes(fastify: FastifyInstance) {
  // WebSocket route for console streaming
  // Connect with: ws://localhost:3001/ws/console?serverId=<id>
  // Auth via Sec-WebSocket-Protocol: access_token, <jwt>
  fastify.get('/ws/console', { websocket: true }, async (socket: WebSocket, request) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    const serverIdParam = url.searchParams.get('serverId');

    // Extract token from Sec-WebSocket-Protocol header
    const protocols = request.headers['sec-websocket-protocol'];
    const parts = protocols?.split(',').map((p) => p.trim()) ?? [];
    const tokenIndex = parts.indexOf('access_token');
    const token = tokenIndex !== -1 && tokenIndex + 1 < parts.length ? parts[tokenIndex + 1] : null;

    if (!token) {
      socket.send(JSON.stringify({ type: 'error', message: 'Missing authentication token' }));
      socket.close(4001, 'Missing authentication token');
      return;
    }

    // Verify JWT using fastify.jwt
    let payload: JWTPayload;
    try {
      payload = fastify.jwt.verify<JWTPayload>(token);
    } catch {
      socket.send(JSON.stringify({ type: 'error', message: 'Invalid or expired token' }));
      socket.close(4002, 'Invalid or expired token');
      return;
    }

    // Verify token_version against DB
    const [dbUser] = await db
      .select({ token_version: users.token_version })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!dbUser || dbUser.token_version !== payload.token_version) {
      socket.send(JSON.stringify({ type: 'error', message: 'Token has been revoked' }));
      socket.close(4002, 'Token has been revoked');
      return;
    }

    if (!hasPermission(payload.permissions, 'server:console')) {
      socket.send(JSON.stringify({ type: 'error', message: 'Insufficient permissions' }));
      socket.close(4003, 'Insufficient permissions');
      return;
    }

    if (!serverIdParam) {
      socket.send(JSON.stringify({ type: 'error', message: 'Missing serverId parameter' }));
      socket.close(4004, 'Missing serverId parameter');
      return;
    }

    const serverId = serverIdParam;

    addConnection(serverId, socket);

    socket.send(
      JSON.stringify({
        type: 'connected',
        serverId,
        user: payload.username,
        timestamp: Date.now(),
      })
    );

    const { lines: initialHistory, total: totalLines } = serverProcessManager.getConsoleHistoryPage(
      serverId,
      0,
      INITIAL_HISTORY_LIMIT
    );
    socket.send(
      JSON.stringify({
        type: 'console:history',
        serverId,
        lines: initialHistory,
        hasMore: totalLines > INITIAL_HISTORY_LIMIT,
        totalLines,
        timestamp: Date.now(),
      })
    );

    const players = playersService.getPlayers(serverId);
    const playerDetails = playersService.getPlayerDetails(serverId);
    if (playerDetails.length > 0) {
      socket.send(
        JSON.stringify({
          type: 'server:players',
          server_id: serverId,
          players,
          playerDetails,
          count: playerDetails.length,
          timestamp: Date.now(),
        })
      );
    }

    const messageTimestamps: Array<number> = [];

    socket.on('message', (rawMessage: Buffer | string) => {
      const now = Date.now();
      while (messageTimestamps.length > 0 && messageTimestamps[0]! < now - WS_MESSAGE_RATE_WINDOW) {
        messageTimestamps.shift();
      }
      messageTimestamps.push(now);

      if (messageTimestamps.length > WS_MESSAGE_RATE_LIMIT) {
        socket.close(1008, 'Rate limit exceeded');
        return;
      }

      try {
        const message: WebSocketMessage = JSON.parse(rawMessage.toString());

        if (message.type === 'console:input' && message.command) {
          const success = serverProcessManager.sendCommand(serverId, message.command);

          if (!success) {
            socket.send(
              JSON.stringify({
                type: 'error',
                message: 'Server is not running or cannot accept commands',
              })
            );
          } else {
            auditService.log({
              userId: payload.sub,
              username: payload.username,
              action: 'console_command',
              resourceType: 'server',
              resourceId: serverId,
              details: { command: message.command },
              ip: request.ip,
            });

            socket.send(
              JSON.stringify({
                type: 'console:input:ack',
                command: message.command,
                timestamp: Date.now(),
              })
            );
          }
        } else if (message.type === 'metrics:subscribe') {
          addMetricsSubscription(serverId, socket);
          socket.send(
            JSON.stringify({
              type: 'metrics:subscribed',
              server_id: serverId,
              timestamp: Date.now(),
            })
          );

          metricsService.getServerMetrics(serverId).then((metrics) => {
            socket.send(
              JSON.stringify({
                type: 'metrics:update',
                server_id: serverId,
                metrics,
                timestamp: Date.now(),
              })
            );
          });
        } else if (message.type === 'metrics:unsubscribe') {
          removeMetricsSubscription(serverId, socket);
          socket.send(
            JSON.stringify({
              type: 'metrics:unsubscribed',
              server_id: serverId,
              timestamp: Date.now(),
            })
          );
        } else if (message.type === 'console:history:load') {
          const offset = message.offset ?? 0;
          const limit = message.limit ?? INITIAL_HISTORY_LIMIT;
          const { lines, total } = serverProcessManager.getConsoleHistoryPage(serverId, offset, limit);
          socket.send(
            JSON.stringify({
              type: 'console:history:page',
              serverId,
              lines,
              offset,
              hasMore: offset + limit < total,
              totalLines: total,
              timestamp: Date.now(),
            })
          );
        } else if (message.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
      } catch {
        socket.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    socket.on('close', () => {
      removeConnection(serverId, socket);
      removeAllMetricsSubscriptions(socket);
    });

    socket.on('error', () => {
      removeConnection(serverId, socket);
      removeAllMetricsSubscriptions(socket);
    });
  });

  // Multiplexed WebSocket — single connection, multiple server channels
  // Connect with: ws://localhost:3001/ws
  // Auth via Sec-WebSocket-Protocol: access_token, <jwt>
  fastify.get('/ws', { websocket: true }, async (socket: WebSocket, request) => {
    const protocols = request.headers['sec-websocket-protocol'];
    const parts = protocols?.split(',').map((p) => p.trim()) ?? [];
    const tokenIndex = parts.indexOf('access_token');
    const token = tokenIndex !== -1 && tokenIndex + 1 < parts.length ? parts[tokenIndex + 1] : null;

    if (!token) {
      socket.send(JSON.stringify({ type: 'error', message: 'Missing authentication token' }));
      socket.close(4001, 'Missing authentication token');
      return;
    }

    let payload: JWTPayload;
    try {
      payload = fastify.jwt.verify<JWTPayload>(token);
    } catch {
      socket.send(JSON.stringify({ type: 'error', message: 'Invalid or expired token' }));
      socket.close(4002, 'Invalid or expired token');
      return;
    }

    const [dbUser] = await db
      .select({ token_version: users.token_version })
      .from(users)
      .where(eq(users.id, payload.sub))
      .limit(1);

    if (!dbUser || dbUser.token_version !== payload.token_version) {
      socket.send(JSON.stringify({ type: 'error', message: 'Token has been revoked' }));
      socket.close(4002, 'Token has been revoked');
      return;
    }

    if (!hasPermission(payload.permissions, 'server:console')) {
      socket.send(JSON.stringify({ type: 'error', message: 'Insufficient permissions' }));
      socket.close(4003, 'Insufficient permissions');
      return;
    }

    socket.send(JSON.stringify({ type: 'connected', user: payload.username, timestamp: Date.now() }));

    // Track which servers this socket is subscribed to
    const subscribedServers = new Set<string>();

    const messageTimestamps: Array<number> = [];

    socket.on('message', (rawMessage: Buffer | string) => {
      const now = Date.now();
      while (messageTimestamps.length > 0 && messageTimestamps[0]! < now - WS_MESSAGE_RATE_WINDOW) {
        messageTimestamps.shift();
      }
      messageTimestamps.push(now);

      if (messageTimestamps.length > WS_MESSAGE_RATE_LIMIT) {
        socket.close(1008, 'Rate limit exceeded');
        return;
      }

      try {
        const message: WebSocketMessage = JSON.parse(rawMessage.toString());

        if (message.type === 'channel:subscribe' && message.serverId) {
          const serverId = message.serverId;
          subscribedServers.add(serverId);
          addConnection(serverId, socket);
          addMetricsSubscription(serverId, socket);

          // Send initial history
          const { lines: initialHistory, total: totalLines } = serverProcessManager.getConsoleHistoryPage(
            serverId,
            0,
            INITIAL_HISTORY_LIMIT
          );
          socket.send(
            JSON.stringify({
              type: 'console:history',
              serverId,
              lines: initialHistory,
              hasMore: totalLines > INITIAL_HISTORY_LIMIT,
              totalLines,
              timestamp: Date.now(),
            })
          );

          // Send immediate metrics
          metricsService.getServerMetrics(serverId).then((metrics) => {
            socket.send(JSON.stringify({ type: 'metrics:update', server_id: serverId, metrics, timestamp: Date.now() }));
          });

          socket.send(JSON.stringify({ type: 'channel:subscribed', serverId, timestamp: Date.now() }));
        } else if (message.type === 'channel:unsubscribe' && message.serverId) {
          const serverId = message.serverId;
          subscribedServers.delete(serverId);
          removeConnection(serverId, socket);
          removeMetricsSubscription(serverId, socket);
          socket.send(JSON.stringify({ type: 'channel:unsubscribed', serverId, timestamp: Date.now() }));
        } else if (message.type === 'console:input' && message.command && message.serverId) {
          const success = serverProcessManager.sendCommand(message.serverId, message.command);
          if (!success) {
            socket.send(JSON.stringify({ type: 'error', message: 'Server is not running' }));
          } else {
            auditService.log({
              userId: payload.sub,
              username: payload.username,
              action: 'console_command',
              resourceType: 'server',
              resourceId: message.serverId,
              details: { command: message.command },
              ip: request.ip,
            });

            socket.send(JSON.stringify({ type: 'console:input:ack', command: message.command, timestamp: Date.now() }));
          }
        } else if (message.type === 'console:history:load' && message.serverId) {
          const offset = message.offset ?? 0;
          const limit = message.limit ?? INITIAL_HISTORY_LIMIT;
          const { lines, total } = serverProcessManager.getConsoleHistoryPage(message.serverId, offset, limit);
          socket.send(
            JSON.stringify({
              type: 'console:history:page',
              serverId: message.serverId,
              lines,
              offset,
              hasMore: offset + limit < total,
              totalLines: total,
              timestamp: Date.now(),
            })
          );
        } else if (message.type === 'ping') {
          socket.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        }
      } catch {
        socket.send(JSON.stringify({ type: 'error', message: 'Invalid message format' }));
      }
    });

    socket.on('close', () => {
      for (const serverId of subscribedServers) {
        removeConnection(serverId, socket);
        removeMetricsSubscription(serverId, socket);
      }
      subscribedServers.clear();
    });

    socket.on('error', () => {
      for (const serverId of subscribedServers) {
        removeConnection(serverId, socket);
        removeMetricsSubscription(serverId, socket);
      }
      subscribedServers.clear();
    });
  });
}

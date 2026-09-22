import pino, { type Logger as PinoLogger, type LevelWithSilent } from 'pino';

export type Logger = PinoLogger;

export function createLogger(opts: { level: LevelWithSilent }): Logger {
  return pino({ level: opts.level });
}

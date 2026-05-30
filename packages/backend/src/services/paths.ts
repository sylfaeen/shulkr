import { join } from 'node:path';

const SHULKR_HOME = process.env.SHULKR_HOME || '/opt/shulkr';

export const APP_DIR = join(SHULKR_HOME, 'app');
export const SERVERS_BASE_PATH = process.env.SERVERS_BASE_PATH || join(SHULKR_HOME, 'servers');
export const BACKUPS_BASE_PATH = process.env.BACKUPS_BASE_PATH || join(SHULKR_HOME, 'backups');
export const DATA_DIR = join(APP_DIR, 'data');
export const DATABASE_PATH = process.env.DATABASE_PATH || join(DATA_DIR, 'shulkr.db');

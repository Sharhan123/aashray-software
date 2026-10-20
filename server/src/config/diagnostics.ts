import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';

export const processStartId = randomUUID();
const commit = process.env.RENDER_GIT_COMMIT;
const instance = process.env.RENDER_INSTANCE_ID;
export const deploymentContext = {
  processStartId,
  gitCommit: commit && /^[a-f0-9]{7,40}$/i.test(commit) ? commit : 'unknown',
  appVersion: /^\d+\.\d+\.\d+$/.test(process.env.npm_package_version ?? '') ? process.env.npm_package_version : 'unknown',
  renderInstanceId: instance && /^srv-[a-z0-9-]{1,100}$/.test(instance) ? instance : undefined,
};

export function processContext() {
  const states: Record<number, string> = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
  return {
    ...deploymentContext,
    uptimeSeconds: Math.round(process.uptime() * 1000) / 1000,
    databaseState: states[mongoose.connection.readyState] ?? 'unknown',
  };
}

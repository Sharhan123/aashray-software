import { createHmac } from 'node:crypto';
import mongoose from 'mongoose';
import type { Options, Store } from 'express-rate-limit';
import { env } from '../config/env.js';

type Counter = { _id: string; totalHits: number; resetAt: Date };
const collectionName = 'login_rate_limit_counters';

/** A shared counter store so login limits remain effective across serverless instances. */
export class MongoRateLimitStore implements Store {
  readonly localKeys = false;
  readonly prefix = 'login:';
  private windowMs = 15 * 60 * 1000;

  init(options: Options) {
    this.windowMs = options.windowMs;
  }

  private storageKey(key: string) {
    return `${this.prefix}${createHmac('sha256', env.SESSION_SECRET).update(key).digest('hex')}`;
  }

  private collection() {
    const collection = mongoose.connection.db?.collection<Counter>(collectionName);
    if (!collection) throw new Error('Rate limit storage is not available.');
    return collection;
  }

  async increment(key: string) {
    const now = new Date();
    const resetAt = new Date(now.getTime() + this.windowMs);
    const result = await this.collection().findOneAndUpdate(
      { _id: this.storageKey(key) },
      [{ $set: {
        totalHits: { $cond: [{ $gt: ['$resetAt', now] }, { $add: [{ $ifNull: ['$totalHits', 0] }, 1] }, 1] },
        resetAt: { $cond: [{ $gt: ['$resetAt', now] }, '$resetAt', resetAt] },
      } }],
      { upsert: true, returnDocument: 'after' },
    );
    const document = (result as unknown as { value?: Counter | null }).value ?? result as unknown as Counter;
    if (!document || typeof document.totalHits !== 'number' || !(document.resetAt instanceof Date)) {
      throw new Error('Rate limit storage did not return a counter.');
    }
    return { totalHits: document.totalHits, resetTime: document.resetAt };
  }

  async decrement(key: string) {
    await this.collection().updateOne({ _id: this.storageKey(key) }, [{ $set: { totalHits: { $max: [0, { $subtract: ['$totalHits', 1] }] } } }]);
  }

  async resetKey(key: string) {
    await this.collection().deleteOne({ _id: this.storageKey(key) });
  }
}

export async function initializeRateLimitIndexes() {
  await mongoose.connection.db?.collection(collectionName).createIndex({ resetAt: 1 }, { expireAfterSeconds: 0, name: 'expire_login_rate_limit_counters' });
}

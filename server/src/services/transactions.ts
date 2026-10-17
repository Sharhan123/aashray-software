import mongoose, { type ClientSession } from 'mongoose';

export async function inTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  let result: T | undefined;
  try {
    await session.withTransaction(async () => { result = await work(session); });
    if (result === undefined) throw new Error('Transaction completed without a result.');
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/transaction numbers are only allowed|does not support transactions|replica set|mongos/i.test(message)) {
      throw Object.assign(new Error('This MongoDB deployment must support transactions for financial operations. No changes were committed.'), { status: 503 });
    }
    throw error;
  } finally { await session.endSession(); }
}

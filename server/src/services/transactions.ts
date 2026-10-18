import mongoose, { type ClientSession } from 'mongoose';

export async function inTransaction<T>(work: (session: ClientSession) => Promise<T>): Promise<T> {
  const session = await mongoose.startSession();
  let result: T | undefined;
  let callbackCompleted = false;
  try {
    await session.withTransaction(async () => {
      result = await work(session);
      callbackCompleted = true;
    });
    // `undefined` is a valid result for transactions that only perform writes.
    // Check callback execution separately instead of treating that result as failure.
    if (!callbackCompleted) throw new Error('Transaction completed without running its work callback.');
    return result as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (/transaction numbers are only allowed|does not support transactions|replica set|mongos/i.test(message)) {
      throw Object.assign(new Error('This MongoDB deployment must support transactions for financial operations. No changes were committed.', { cause: error }), { status: 503 });
    }
    throw error;
  } finally { await session.endSession(); }
}

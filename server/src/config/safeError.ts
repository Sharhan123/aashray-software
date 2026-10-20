const errorTypes = new Set([
  'Error', 'TypeError', 'RangeError', 'SyntaxError', 'ZodError', 'ValidationError', 'CastError',
  'MongoServerError', 'MongoNetworkError', 'MongoNetworkTimeoutError', 'MongoServerSelectionError',
  'MongooseServerSelectionError', 'MongoTopologyClosedError', 'MongoPoolClosedError',
  'MongoWaitQueueTimeoutError', 'MongoNotConnectedError',
]);

// Never serialize messages, query values, causes, URLs or MongoDB topology objects.
export function safeError(error: unknown) {
  const value = error as { name?: string; code?: unknown; stack?: string } | null;
  const frames = typeof value?.stack === 'string'
    ? value.stack.split('\n').slice(1).flatMap((line) => {
      const match = line.match(/[/\\]([A-Za-z0-9_-]+\.(?:ts|js)):(\d+):(\d+)\)?$/);
      return match ? [`${match[1]}:${match[2]}:${match[3]}`] : [];
    }).slice(0, 8) : [];
  return {
    type: value?.name && errorTypes.has(value.name) ? value.name : 'Error',
    code: typeof value?.code === 'number' ? value.code : undefined,
    frames,
  };
}

export function isDatabaseUnavailable(error: unknown): boolean {
  const value = error as { name?: string; code?: unknown } | null;
  return [
    'MongoNetworkError', 'MongoNetworkTimeoutError', 'MongoServerSelectionError',
    'MongooseServerSelectionError', 'MongoTopologyClosedError', 'MongoPoolClosedError',
    'MongoWaitQueueTimeoutError', 'MongoNotConnectedError',
  ].includes(value?.name ?? '') || (value?.name === 'MongoServerError' && [6, 7, 89, 91, 189, 9001].includes(Number(value.code)));
}

export function isDatabaseError(error: unknown): boolean {
  const value = error as { name?: string } | null;
  return typeof value?.name === 'string' && /^(?:Mongo|Mongoose)/.test(value.name);
}

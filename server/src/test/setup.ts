process.env.NODE_ENV = 'test';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/aashray_test_only';
process.env.SESSION_SECRET = 'test-only-secret-with-more-than-32-bytes';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
const isolatedMongoUri = process.env.STABILITY_TEST_MONGODB_URI;
if (isolatedMongoUri) {
  const uri = new URL(isolatedMongoUri);
  if (
    uri.protocol !== 'mongodb:' || !['127.0.0.1', 'localhost', '[::1]'].includes(uri.hostname) ||
    uri.username || uri.password || !/^\/aashray_stability_test(?:_[a-z0-9_-]+)?$/.test(uri.pathname) ||
    uri.searchParams.get('replicaSet') !== 'rs0'
  ) throw new Error('STABILITY_TEST_MONGODB_URI must point to a loopback-only rs0 database named aashray_stability_test[_suffix], without credentials.');
  process.env.MONGODB_URI = isolatedMongoUri;
} else {
  process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/aashray_test_only';
}

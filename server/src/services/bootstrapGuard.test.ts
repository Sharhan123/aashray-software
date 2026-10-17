import { describe, expect, it } from 'vitest';
import { assertBootstrapAllowed } from './bootstrapGuard.js';

describe('initial administrator bootstrap guard', () => {
  it('requires the explicit one-time flag', () => {
    expect(() => assertBootstrapAllowed('false', false)).toThrow(/ENABLE_ADMIN_BOOTSTRAP/);
  });
  it('refuses to recreate or modify an existing Super Admin', () => {
    expect(() => assertBootstrapAllowed('true', true)).toThrow(/already exists/);
  });
  it('allows first setup only when explicitly enabled and no administrator exists', () => {
    expect(() => assertBootstrapAllowed('true', false)).not.toThrow();
  });
});

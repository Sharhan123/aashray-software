export function assertBootstrapAllowed(enabled: string, hasSuperAdmin: boolean): void {
  if (enabled !== 'true') throw new Error('Set ENABLE_ADMIN_BOOTSTRAP=true for this one-time command.');
  if (hasSuperAdmin) throw new Error('A Super Admin already exists. Bootstrap will not modify it.');
}

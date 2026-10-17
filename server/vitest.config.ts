import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  test: { setupFiles: ['./src/test/setup.ts'], exclude: [...configDefaults.exclude, 'dist/**'] },
});

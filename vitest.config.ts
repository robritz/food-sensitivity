import { defineConfig } from 'vitest/config'

// Scoped to src/ so this doesn't also pick up data-access/test -- that
// workspace has its own `npm test`, run against a local Supabase instance
// (see data-access/README.md), not the plain unit-test env this config sets up.
export default defineConfig({
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
  },
})

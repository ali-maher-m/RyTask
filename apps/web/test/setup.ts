import { cleanup } from '@testing-library/react';
import { afterEach, expect } from 'vitest';
import * as axeMatchers from 'vitest-axe/matchers';

/**
 * Global test setup (D12). Unmounts the React tree after each test (RTL) and extends Vitest's
 * `expect` with the `vitest-axe` accessibility matchers (`toHaveNoViolations`) so component
 * tests can assert WCAG conformance inline (NFR-WEB-002).
 */
expect.extend(axeMatchers);

afterEach(() => {
  cleanup();
});

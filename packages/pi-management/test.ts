import { expect, test } from 'bun:test';
import { PI_MANAGEMENT_PACKAGE_NAME, PI_MANAGEMENT_PACKAGE_VERSION } from './src/index.js';

test('management package identity is stable', () => {
  expect(PI_MANAGEMENT_PACKAGE_NAME).toBe('@upup/pi-management');
  expect(PI_MANAGEMENT_PACKAGE_VERSION).toBe('0.1.0');
});

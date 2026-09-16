import { createElectronAdapter } from './electron-adapter.js';
import { createWebAdapter } from './web-adapter.js';

export function createPlatformAdapter() {
  if (window.echoLine) return createElectronAdapter(window.echoLine);
  return createWebAdapter();
}

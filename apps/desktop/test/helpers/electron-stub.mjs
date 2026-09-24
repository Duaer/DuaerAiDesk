/** Minimal Electron stand-in so main-process modules can load under `node --test`. */
export const app = {
  isReady: () => false,
  getPath: () => "/tmp",
  getAppPath: () => "/tmp",
  isPackaged: false,
};

export default { app };

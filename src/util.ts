import type { Logger } from 'stream-watch/cjs';

export const logger = (tag: string): Logger => ({
  info(...args) {
    console.log(100, `[${tag}]`, ...args);
  },
  error(...args) {
    console.error(999, `[${tag}]`, ...args);
  },
});

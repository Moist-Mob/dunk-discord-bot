import type { AuthProvider } from '@twurple/auth';
import { ApiClient, HelixStream, type UserIdResolvable } from '@twurple/api';
import { EventSubWsListener } from '@twurple/eventsub-ws';
import { logger } from './util';

export type WatcherInit = {
  subscribeWithUserId: UserIdResolvable;
  subscribeToUserId: UserIdResolvable;
  authProvider: AuthProvider;
  clientId: string;
  getStream: () => Promise<HelixStream | null>;
  update: (stream: HelixStream | null) => void;
};
export type WatcherReturn = {
  shutdown: () => Promise<void>;
};

export const initEventSub = async ({
  subscribeWithUserId,
  subscribeToUserId,
  authProvider,
  clientId,
  getStream,
  update,
}: WatcherInit): Promise<WatcherReturn> => {
  const log = logger('eventsub');

  async function expectStreamStatus(expect: true): Promise<HelixStream>;
  async function expectStreamStatus(expect: false): Promise<null>;
  async function expectStreamStatus(expect: boolean): Promise<HelixStream | null> {
    const retryDelay = 2_000;
    const maxRetries = 3;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      log.info(`expectStreamStatus(): attempt=${attempt}/${maxRetries} expecting=${expect}`);

      const stream = await getStream();
      log.info(`expectStreamStatus(): got=${!!stream}`);

      if (expect === true && stream !== null) {
        return stream;
      } else if (expect === false && stream === null) {
        return null;
      }

      log.info(`expectStreamStatus(): Retrying in ${retryDelay}ms`);
      await new Promise(resolve => setTimeout(resolve, retryDelay).unref());
    }

    log.info('expectStreamStatus(): Gave up');
    throw new Error('Out of retries');
  }

  // seriously, fuck twurple
  const eventSubAuthProvider: AuthProvider = {
    clientId,
    getCurrentScopesForUser: (_: UserIdResolvable) => authProvider.getCurrentScopesForUser(subscribeWithUserId),
    getAccessTokenForUser: (_: UserIdResolvable, ...scopeSets: Array<string[] | undefined>) =>
      authProvider.getAccessTokenForUser(subscribeWithUserId, ...scopeSets),
    getAnyAccessToken: (_?: UserIdResolvable) => authProvider.getAnyAccessToken(subscribeWithUserId),
  };

  const listener = new EventSubWsListener({
    apiClient: new ApiClient({
      authProvider: eventSubAuthProvider,
    }),
  });

  listener.onUserSocketConnect(userId => {
    log.info(`Connected socket for ${userId}`);
  });
  listener.onUserSocketDisconnect(userId => {
    log.info(`Disconnected socket for ${userId}`);
  });
  listener.onRevoke(event => {
    log.error(`Subscription revoked: ${event}`);
  });
  listener.onStreamOnline(subscribeToUserId, async evt => {
    try {
      update(await expectStreamStatus(true));
    } catch (e) {
      log.error('ignoring eventsub stream online event');
    }
  });
  listener.onStreamOffline(subscribeToUserId, async evt => {
    try {
      update(await expectStreamStatus(false));
    } catch (e) {
      log.error('ignoring eventsub stream offline event');
    }
  });
  listener.start();

  return {
    async shutdown() {
      listener.stop();
    },
  };
};

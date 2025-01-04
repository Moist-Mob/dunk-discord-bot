import { AuthProvider, RefreshingAuthProvider } from '@twurple/auth';
import { ApiClient } from '@twurple/api';

import { updateUserCredentials } from './config/config';
import type { TwitchSecrets } from './config/_twitch';

import { logger } from './util';

export type TwurpleInit = {
  secrets: TwitchSecrets;
};

export interface TwurpleReturn {
  tokenUserId: string;
  apiClient: ApiClient;
  authProvider: AuthProvider;
}

export const initTwurple = async ({ secrets }: TwurpleInit): Promise<TwurpleReturn> => {
  const log = logger('twurple');

  const appCredentials = secrets.app;
  const userCredentials = secrets.user;

  const authProvider = new RefreshingAuthProvider({
    clientId: appCredentials.clientId,
    clientSecret: appCredentials.clientSecret.unwrap(),
  });

  const tokenUserId = await authProvider.addUserForToken(
    {
      accessToken: userCredentials.accessToken.unwrap(),
      refreshToken: userCredentials.refreshToken.unwrap(),
      scope: userCredentials.scope,
      obtainmentTimestamp: userCredentials.obtainmentTimestamp,
      expiresIn: userCredentials.expiresIn,
    },
    ['chat']
  );
  log.info(`addUserForToken: ${tokenUserId}`);

  authProvider.onRefresh(async (userId, token) => {
    try {
      await updateUserCredentials({
        accessToken: token.accessToken,
        refreshToken: token.refreshToken,
        scope: token.scope,
        obtainmentTimestamp: token.obtainmentTimestamp,
        expiresIn: token.expiresIn,
      });
      log.info(`saved user credentials for userid=${userId}`);
    } catch (e) {
      log.error(`failed to save user credentials for userid=${userId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  });

  authProvider.onRefreshFailure(reason => {
    log.error(`failed to refresh token: ${reason}`);
  });

  const apiClient = new ApiClient({ authProvider });

  return {
    apiClient,
    authProvider,
    tokenUserId,
  };
};

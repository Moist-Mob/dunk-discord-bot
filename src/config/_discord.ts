import { StaticDecode, Type as T } from '@sinclair/typebox';

import { TSecret } from './secret';

export const DiscordConfig = T.Object({
  server: T.String(),
  onlinePing: T.Object({
    channel: T.String(),
    role: T.String(),
  }),
  reacjiRoles: T.Object({
    messageSnowflake: T.String(),
    bindings: T.Record(T.String(), T.String()),
  }),
});
export type DiscordConfig = StaticDecode<typeof DiscordConfig>;

export const DiscordSecrets = T.Object({
  token: TSecret('token', T.String()),
});
export type DiscordSecrets = StaticDecode<typeof DiscordSecrets>;

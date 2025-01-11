import { StaticDecode, Type as T } from '@sinclair/typebox';

import { TSecret } from './secret';

export const DiscordConfig = T.Object({
  server: T.String(),
  pings: T.Object({
    channel: T.String(),
    roles: T.Record(T.Union([T.Literal('online'), T.Literal('bet'), T.Literal('unlock')]), T.String()),
  }),
  reacjiRoles: T.Object({
    messageSnowflake: T.String(),
    bindings: T.Record(T.String(), T.String()),
  }),
});
export type DiscordConfig = StaticDecode<typeof DiscordConfig>;
export type PingRoles = keyof DiscordConfig['pings']['roles'];

export const DiscordSecrets = T.Object({
  token: TSecret('token', T.String()),
});
export type DiscordSecrets = StaticDecode<typeof DiscordSecrets>;

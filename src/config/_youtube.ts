import { StaticDecode, Type as T } from '@sinclair/typebox';

export const YoutubeConfig = T.Object({
  channelId: T.String(),
  pollInterval: T.Number(),
  stateFile: T.String(),
});
export type YoutubeConfig = StaticDecode<typeof YoutubeConfig>;

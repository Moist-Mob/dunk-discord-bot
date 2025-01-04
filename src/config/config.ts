import { resolve } from 'node:path';

import { Static, StaticDecode, Type as T } from '@sinclair/typebox';

import { Secret } from './secret';
import { FileSource } from './file_source';
import { TwitchConfig, TwitchSecrets, UserCredentials } from './_twitch';
import { DiscordConfig, DiscordSecrets } from './_discord';

const Config = T.Object({
  twitch: TwitchConfig,
  discord: DiscordConfig,
});

const Secrets = T.Object({
  twitch: TwitchSecrets,
  discord: DiscordSecrets,
});

const configFile = new FileSource(resolve(__dirname, '..', '..', 'config.json'), Config);
const secretsFile = new FileSource(resolve(__dirname, '..', '..', 'secrets.json'), Secrets);

export type Secrets = StaticDecode<typeof Secrets>;
export type Config = StaticDecode<typeof Config>;

export const loadConfig = async (): Promise<{ config: Config; secrets: Secrets }> => {
  const [config, secrets] = await Promise.all([configFile.load(), secretsFile.load()]);
  return {
    config,
    secrets,
  };
};

type Simplify<T> = { [K in keyof T]: T[K] } & unknown;
type UpdateCredentials = Simplify<Static<typeof UserCredentials>>;
export const updateUserCredentials = async (newCredentials: UpdateCredentials): Promise<void> => {
  const accessToken = new Secret('accessToken', newCredentials.accessToken);
  const refreshToken = new Secret('accessToken', newCredentials.refreshToken);

  await secretsFile.update(({ twitch: { user, ...rest }, discord }) => ({
    twitch: {
      ...rest,
      user: {
        ...newCredentials,
        accessToken,
        refreshToken,
      },
    },
    discord,
  }));
};

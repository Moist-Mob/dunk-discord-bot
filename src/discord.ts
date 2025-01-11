import {
  Client,
  Events,
  GatewayIntentBits,
  GuildMember,
  MessageReaction,
  PartialMessageReaction,
  Partials,
  PartialUser,
  Role,
  User,
} from 'discord.js';

import type { DiscordConfig, DiscordSecrets, PingRoles } from './config/_discord';
import { logger } from './util';

export type DiscordInit = {
  config: DiscordConfig;
  secrets: DiscordSecrets;
};

export type Discord = {
  getPingRole: (role: PingRoles) => Role | '';
  announce: (text: string) => Promise<boolean>;
  shutdown: () => Promise<void>;
};

export const initDiscord = async ({ config, secrets }: DiscordInit): Promise<Discord> => {
  const log = logger('discord');

  const pingChannel = config.pings.channel;
  const discordServer = config.server;
  const token = secrets.token;

  const client = await new Promise<Client<true>>((resolve, reject) => {
    const client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
      ],
      partials: [Partials.Message, Partials.Channel, Partials.Reaction],
    });
    client.once(Events.ClientReady, resolve);
    client.once(Events.Error, reject);
    client.login(token.unwrap());
    return client;
  });

  const guild = await client.guilds.fetch(discordServer);

  // fill role cache
  const rolesCache = await guild.roles.fetch(undefined);

  const getPingRole = (role: PingRoles) => {
    const lcase = config.pings.roles[role].toLowerCase();
    return rolesCache.find(role => role.name.toLowerCase() === lcase) ?? '';
  };

  const announce = async (text: string): Promise<boolean> => {
    const trimmed = text.trim().replace(/^\s+/gm, '\n');

    const channel = await client.channels.fetch(pingChannel);
    if (!channel) {
      log.error('[announce]: channel is undefined');
      return false;
    }

    if (!channel.isSendable()) {
      log.error('[announce]: channel is not sendable');
      return false;
    }

    try {
      await channel.send(trimmed);
      // console.log(`---\n${trimmed}\n---`);
      return true;
    } catch (e) {
      log.error('[announce]: failed to send', e);
      return false;
    }
  };

  const bindings: Record<string, string> = Object.fromEntries(
    Object.entries(config.reacjiRoles.bindings).map(([key, value]) => [key.toLowerCase(), value.toLowerCase()])
  );
  const roleLookup = async (
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser
  ): Promise<undefined | { member: GuildMember; role: Role }> => {
    if (reaction.message.id !== config.reacjiRoles.messageSnowflake) return;

    log.info(`[roleLookup] user ${user.username}, reacji name=${reaction.emoji.name} name=${reaction.emoji.name}`);

    const reacjiName = reaction.emoji.name?.toLowerCase();
    if (!reacjiName) {
      log.error(`[roleLookup] no reacji name for ${reaction.emoji.id}`);
      return;
    }

    const targetRoleName = Object.prototype.hasOwnProperty.call(bindings, reacjiName)
      ? bindings[reacjiName].toLowerCase()
      : undefined;
    if (!targetRoleName) {
      log.error(`[roleLookup] no binding for ${targetRoleName}`);
      return;
    }

    const role = rolesCache.find(role => role.name.toLowerCase() === targetRoleName);
    if (!role) {
      log.info(`[roleLookup] failed to find role=${targetRoleName}`);
      return;
    }

    const member = await guild.members.fetch(user.id);
    return { member, role };
  };

  client.on(Events.MessageReactionAdd, async (reaction, user) => {
    try {
      const res = await roleLookup(reaction, user);
      if (!res) return;

      log.info(`Adding ${res.role.name} to ${user.username} / ${res.member.user.username}`);
      await res.member.roles.add(res.role);
    } catch (e) {
      log.error('Failed: ', e);
    }
  });
  client.on(Events.MessageReactionRemove, async (reaction, user) => {
    try {
      const res = await roleLookup(reaction, user);
      if (!res) return;

      log.info(`Removing ${res.role.name} from ${user.username} / ${res.member.user.username}`);
      await res.member.roles.remove(res.role);
    } catch (e) {
      log.error('Failed: ', e);
    }
  });

  return {
    getPingRole,
    announce,
    shutdown: async (): Promise<void> => {
      await client.destroy();
    },
  };
};

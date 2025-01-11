import { HelixStream } from '@twurple/api';
import { ChatClient } from '@twurple/chat';

import { escapeMarkdown } from 'discord.js';
import { Duration, ThrottlePolicy, Watcher } from 'stream-watch/cjs';

import { loadConfig } from './config/config';
import { initTwurple } from './twurple';
import { initDiscord } from './discord';
import { initEventSub } from './eventsub';
import { logger } from './util';
import { initNotifications, NotificationType } from './notifications';

(async () => {
  const log = logger('main');

  const { config, secrets } = await loadConfig();

  const discord = await initDiscord({
    config: config.discord,
    secrets: secrets.discord,
  });

  const { getPingRole, announce, shutdown: shutdownDiscord } = discord;

  const { apiClient, authProvider, tokenUserId } = await initTwurple({
    secrets: secrets.twitch,
  });

  const announceDiscord = async (stream: HelixStream) => {
    const title = `${stream.title} [${stream.gameName}]`;

    announce(`
      ${getPingRole('online')} **He's live!** _${escapeMarkdown(title)}_

      <https://www.twitch.tv/dunkorslam>
    `);
  };

  const channelName = config.twitch.channel;
  const stream = await apiClient.users.getUserByName(channelName);
  if (!stream) {
    log.error(`Failed to look up stream: ${channelName}`);
    return;
  }
  const getStream = () => apiClient.streams.getStreamByUserId(stream.id);

  const watcher = new Watcher({
    getStream,
    logger: logger('watcher'),
  });
  const sub = watcher.on('online', announceDiscord, {
    throttle: new ThrottlePolicy({
      notifyOnInitial: false,
      atMostOncePer: Duration.hour(8),
    }),
  });

  const { shutdown: shutdownEventSub } = await initEventSub({
    authProvider,
    clientId: secrets.twitch.app.clientId,
    getStream,
    subscribeToUserId: stream.id,
    subscribeWithUserId: tokenUserId,
    update: watcher.update.bind(watcher),
  });

  watcher.poll({
    every: Duration.minute(5),
    immediately: true,
  });

  const streamer = config.twitch.channel;
  const client = new ChatClient({
    channels: [streamer],
    rejoinChannelsOnReconnect: true,
  });
  client.onDisconnect((manually, reason) => {
    log.info(`chat disconnected manually=${manually}, reason=${reason ? reason.message : '(none)'}`);
  });
  client.onConnect(() => {
    log.info(`chat connected`);
  });

  const botId = config.twitch.botId;
  const SANITIZE_RE = /\p{C}+/gu;

  const notifs = initNotifications(discord);

  const enum BetState {
    None = 0,
    Open = 1,
    Closed = 2,
    Finalized = 3,
  }
  let state: BetState = 0;

  client.onMessage(async (channel, user, text, msg) => {
    // ignore other users and channels
    if (channel !== streamer || msg.userInfo.userId !== botId) return;

    const normalized = text.replace(SANITIZE_RE, ' ').trim().replace(/\s+/, ' ');

    for (const notif of notifs) {
      const result = notif.extract(normalized);
      if (!result) continue;

      let newState: BetState | undefined;
      switch (notif.type) {
        case NotificationType.BetOpen:
          newState = BetState.Open;
          break;
        case NotificationType.BetClosed:
          newState = BetState.Closed;
          break;
        case NotificationType.BetFinalized:
          newState = BetState.Finalized;
          break;
      }
      if (newState !== undefined) {
        // only announce as things progress; don't re-announce on reopened bets
        if (newState <= state) return;
        state = newState % BetState.Finalized;
      }

      await announce(notif.format(result));
      break;
    }
  });

  client.connect();
})();

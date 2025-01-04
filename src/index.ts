import { initTwurple } from './twurple';
import { loadConfig } from './config/config';
import { initDiscord } from './discord';
import { escapeMarkdown } from 'discord.js';
import { HelixStream } from '@twurple/api';
import { Duration, ThrottlePolicy, Watcher } from 'stream-watch/cjs';
import { initEventSub } from './eventsub';
import { logger } from './util';

(async () => {
  const log = logger('main');

  const { config, secrets } = await loadConfig();

  const {
    getPingRole,
    announce,
    shutdown: shutdownDiscord,
  } = await initDiscord({
    config: config.discord,
    secrets: secrets.discord,
  });

  const { apiClient, authProvider, tokenUserId } = await initTwurple({
    secrets: secrets.twitch,
  });

  const announceDiscord = async (stream: HelixStream) => {
    const title = `${stream.title} [${stream.gameName}]`;

    announce(`
      ${getPingRole()} **He's live!** _${escapeMarkdown(title)}_

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
})();

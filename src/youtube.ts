import { readFile, writeFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { inspect } from 'node:util';
import { Static, Type as T } from '@sinclair/typebox';
import { TypeCompiler } from '@sinclair/typebox/compiler';
import { YoutubeConfig } from './config/_youtube';
import { XMLParser } from 'fast-xml-parser';
import { logger } from './util';
const log = logger('youtube');

const TFeedEntry = T.Object({
  title: T.String(),
  published: T.String(),
  'yt:videoId': T.String(),
});
type FeedEntry = Static<typeof TFeedEntry>;
const RSS = T.Object({
  feed: T.Object({
    entry: T.Array(TFeedEntry),
  }),
});

export type YoutubeInit = {
  config: YoutubeConfig;
};

export type VideoNotification = {
  title: string;
  url: string;
  relTime: string;
};
type OnVideoCallback = (video: VideoNotification) => Promise<void>;
export type Youtube = {
  onVideo: (cb: OnVideoCallback) => void;
  shutdown: () => Promise<void>;
};

const compiled = TypeCompiler.Compile(RSS);
const descending = (a: FeedEntry, b: FeedEntry) => (a.published < b.published ? 1 : a.published > b.published ? -1 : 0);
const ascending = (a: FeedEntry, b: FeedEntry) => (a.published < b.published ? -1 : a.published > b.published ? 1 : 0);

const toNotif = (video: FeedEntry): VideoNotification => {
  const url = `https://www.youtube.com/watch?v=${video['yt:videoId']}`;
  const d = new Date(video.published).getTime();
  const published = Number.isNaN(d) ? Date.now() : d;
  const relTime = `<t:${Math.floor(published / 1000)}:R>`;
  return { title: video.title, url, relTime };
};

export const initYoutube = async ({ config }: YoutubeInit): Promise<Youtube> => {
  const { channelId, pollInterval, stateFile: stateFileName } = config;
  const callbacks: OnVideoCallback[] = [];
  let lastVideo: string | undefined = undefined;
  let nextTime = Date.now();

  const baseDir = resolve(__dirname, '..') + sep;
  const stateFile = resolve(baseDir, stateFileName);
  if (!stateFile.startsWith(baseDir)) {
    throw new Error('Refusing to escape parent directory');
  }

  const pushVideos = async (videos: FeedEntry[]) => {
    const since = lastVideo;
    const newVideos = since === undefined ? videos.slice(0, 1) : videos.filter(v => v.published > since);

    videos.sort(ascending);
    for (const video of newVideos) {
      const notif = toNotif(video);
      log.info(`new video: ${notif.title} - ${notif.url}`);
      for (const cb of callbacks) {
        try {
          await cb(notif);
        } catch (e) {
          log.error('callback failed', e);
        }
      }
      lastVideo = video.published;
    }

    if (lastVideo !== undefined) {
      try {
        await writeFile(stateFile, lastVideo);
      } catch (e) {
        log.error('failed to write statefile', e);
      }
    }
  };

  try {
    const last = await readFile(stateFile, 'utf-8');
    if (typeof last === 'string') {
      lastVideo = last;
    } else {
      log.error('invalid statefile contents', last);
    }
  } catch (e) {
    log.error('failed to read statefile', e);
  }

  let timer: NodeJS.Timeout | undefined = undefined;

  const parser = new XMLParser();
  const poll = async () => {
    try {
      const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`);
      const obj = parser.parse(await res.text());
      if (!compiled.Check(obj)) {
        log.error('rss schema error');
        for (const err of compiled.Errors(obj)) {
          log.error(`${err.path}: ${err.message}`);
        }
      } else {
        if (obj.feed.entry.length > 0) {
          pushVideos(obj.feed.entry);
        }
      }
    } catch (e) {
      log.error('poll failed', e);
    } finally {
      pollNext();
    }
  };

  const pollNext = () => {
    new Promise(resolve => {
      clearTimeout(timer);
      const waitFor = Math.max(0, nextTime - Date.now());
      if (waitFor > 0) log.info(`poll: waiting ${waitFor / 1000}s`);
      timer = setTimeout(resolve, waitFor);
    })
      .then(() => poll())
      .then(() => {
        log.info('poll success');
      })
      .catch(e => {
        log.error('poll error', e);
      })
      .finally(() => {
        nextTime += pollInterval;
        pollNext();
      });
  };

  pollNext();

  return {
    onVideo: (cb: OnVideoCallback) => {
      callbacks.push(cb);
    },
    shutdown: async () => {
      callbacks.length = 0;
      clearTimeout(timer);
      timer = undefined;
    },
  };
};

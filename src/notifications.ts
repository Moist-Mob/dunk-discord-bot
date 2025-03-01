import type { Discord } from './discord';

export enum NotificationType {
  BetOpen,
  BetClosed,
  BetFinalized,
  CosmeticUnlock,
  CosmeticLock,
}

export interface Matcher<T extends Record<string, string>> {
  type: NotificationType;
  extract(text: string): T | null;
  format(data: T): string;
}

export const initNotifications = ({ getPingRole, emoji }: Discord) => {
  const matchGroup = <
    const T extends NotificationType,
    const Ks extends string[],
    Rec extends Record<Ks[number], string>,
  >(
    type: T,
    re: RegExp,
    format: (data: Rec) => string,
    ...groupNames: Ks
  ): Matcher<Rec> => {
    const extract = (text: string): Rec | null => {
      const match = text.match(re);
      if (!match) return null;
      const groups = match.groups ?? {};
      for (const groupName of groupNames) {
        if (!Object.prototype.hasOwnProperty.call(groups, groupName)) return null;
      }
      return groups as Rec;
    };
    return { type, extract, format };
  };

  const betOpen = /^Guessing is open.(?: (?<betArgs>.*))?$/i;
  const notifyOpen = matchGroup(
    NotificationType.BetOpen,
    betOpen,
    data => `${getPingRole('bet')} Predictions are open!${data.betArgs ? ` | ${data.betArgs}` : ''}`,
    'betArgs'
  );

  const betClosed = /^Predictions are closed/i;
  const notifyClosed = matchGroup(NotificationType.BetClosed, betClosed, () => `Predictions are closed!`);

  const betFinal = /^Prediction ended with a (?<betResult>win|loss).*?\(Yes: (?<yes>\d+), No: (?<no>\d+)\)$/i;
  const notifyFinal = matchGroup(
    NotificationType.BetFinalized,
    betFinal,
    ({ betResult, yes, no }) =>
      betResult === 'win'
        ? `${yes} Big brainers with their 200iq plays once again ${emoji('dnkHappy')}`
        : `${no} Tiny brainers won ${emoji('dnkAngry')}`,
    'betResult',
    'yes',
    'no'
  );

  const cosmeticUnlocked = /^Free cosmetic unlocked!(?: (?<msg>.*))?/i;
  const notifyUnlock = matchGroup(
    NotificationType.CosmeticUnlock,
    cosmeticUnlocked,
    ({ msg }) => `${getPingRole('unlock')} A new cosmetic has been unlocked!${msg ? ` | ${msg}` : ''}`,
    'msg'
  );

  const cosmeticLocked = /^Free cosmetic is no longer available/i;
  const notifyLock = matchGroup(
    NotificationType.CosmeticLock,
    cosmeticLocked,
    () => `The free cosmetic is now locked up for good!`
  );

  return [notifyOpen, notifyClosed, notifyFinal, notifyUnlock, notifyLock];
};

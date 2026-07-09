import { Provider } from '@nestjs/common';
import { PubSub } from 'graphql-subscriptions';

/**
 * Shared PubSub instance for real-time notification delivery. Single process
 * only — if the app ever scales horizontally, swap this for a Redis-backed
 * PubSub (the publish/subscribe API stays identical).
 */
export const PUB_SUB = 'PUB_SUB';

export const pubSubProvider: Provider = {
  provide: PUB_SUB,
  useValue: new PubSub(),
};

/** Trigger name for the "a notification was created" subscription. */
export const NOTIFICATION_CREATED = 'notificationCreated';

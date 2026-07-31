import { EmailTemplate } from '@prisma/client';

/**
 * Every template is classified as either transactional (security, receipts,
 * moderation) or marketing. Transactional emails ignore user preferences —
 * they carry legal / operational meaning and shouldn't be silenced. Marketing
 * respects `notifMarketing`; activity emails respect `notifOffers`.
 */
export type EmailCategory = 'transactional' | 'activity' | 'marketing';

export const TEMPLATE_CATEGORY: Record<EmailTemplate, EmailCategory> = {
  pin_code: 'transactional',
  plan_activated: 'transactional',
  boost_receipt: 'transactional',
  verification_approved: 'transactional',
  verification_rejected: 'transactional',
  account_suspended: 'transactional',
  welcome: 'transactional',
  plan_expiring: 'transactional',
  plan_expired: 'transactional',
  admin_weekly_summary: 'transactional',
  activity_digest: 'activity',
  comeback: 'marketing',
};

interface UserPrefs {
  notifOffers?: boolean;
  notifMarketing?: boolean;
}

/** Returns true when this template should be delivered to a user with the
 *  given preferences. Transactional always passes. */
export function shouldSendEmail(
  template: EmailTemplate,
  prefs: UserPrefs,
): boolean {
  const category = TEMPLATE_CATEGORY[template];
  if (category === 'transactional') return true;
  if (category === 'marketing') return prefs.notifMarketing !== false;
  if (category === 'activity') return prefs.notifOffers !== false;
  return true;
}

/** Which user preference key an unsubscribe link should flip for a given
 *  template. Only defined for non-transactional templates — transactional
 *  emails carry no unsubscribe link. */
export function unsubscribeKeyFor(
  template: EmailTemplate,
): 'notifMarketing' | 'notifOffers' | null {
  const category = TEMPLATE_CATEGORY[template];
  if (category === 'marketing') return 'notifMarketing';
  if (category === 'activity') return 'notifOffers';
  return null;
}

/**
 * Domain events consumed by {@link EmailListener}. Emitters live in the
 * originating services (users, verifications, products) and know nothing
 * about the email module — the listener translates each event into an
 * `EmailService.send(...)` call queued in BullMQ.
 *
 * The PIN code email is intentionally NOT event-driven: users wait for it
 * on-screen, so the OTP resolver calls {@link EmailService.send} directly.
 */

import type { UserPlan } from '@prisma/client';

export interface PlanActivatedEvent {
  userId: string;
  /** New plan the user is on after the change. */
  plan: UserPlan;
  /** Amount charged, in XAF. */
  amount: number;
  planChangeId: string;
  expiresAt: Date | null;
}

export interface BoostReceiptEvent {
  userId: string;
  productId: string;
  productTitle: string;
  /** Amount charged, in XAF. */
  amount: number;
  paymentId: string;
  boostedUntil: Date;
}

export interface VerificationApprovedEvent {
  userId: string;
  requestId: string;
}

export interface VerificationRejectedEvent {
  userId: string;
  requestId: string;
  reason?: string;
}

export interface AccountSuspendedEvent {
  userId: string;
  reason?: string;
  /** Timestamp of the suspension — used as part of the dedupe key so a
   *  re-suspension after unsuspend still fires an email. */
  suspendedAt: Date;
}

export interface UserRegisteredEvent {
  userId: string;
}

export const EmailEvents = {
  PlanActivated: 'email.plan.activated',
  BoostReceipt: 'email.boost.receipt',
  VerificationApproved: 'email.verification.approved',
  VerificationRejected: 'email.verification.rejected',
  AccountSuspended: 'email.account.suspended',
  UserRegistered: 'email.user.registered',
} as const;

import { registerEnumType } from '@nestjs/graphql';

/** Mirrors the Prisma `ReportType` enum; registered for GraphQL. */
export enum ReportType {
  product = 'product',
  user = 'user',
}

/** Mirrors the Prisma `ReportReason` enum; registered for GraphQL. */
export enum ReportReason {
  spam = 'spam',
  scam = 'scam',
  prohibited = 'prohibited',
  offensive = 'offensive',
  fake = 'fake',
  harassment = 'harassment',
  other = 'other',
}

/** Mirrors the Prisma `ReportStatus` enum; registered for GraphQL. */
export enum ReportStatus {
  pending = 'pending',
  reviewed = 'reviewed',
  dismissed = 'dismissed',
}

registerEnumType(ReportType, { name: 'ReportType' });
registerEnumType(ReportReason, { name: 'ReportReason' });
registerEnumType(ReportStatus, { name: 'ReportStatus' });

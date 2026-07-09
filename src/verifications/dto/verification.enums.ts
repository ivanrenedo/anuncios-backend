import { registerEnumType } from '@nestjs/graphql';

export enum VerificationStatus {
  pending = 'pending',
  approved = 'approved',
  rejected = 'rejected',
}

registerEnumType(VerificationStatus, { name: 'VerificationStatus' });

import { registerEnumType } from '@nestjs/graphql';

export enum HomeSuggestionStatus {
  pending = 'pending',
  accepted = 'accepted',
  dismissed = 'dismissed',
}

registerEnumType(HomeSuggestionStatus, { name: 'HomeSuggestionStatus' });

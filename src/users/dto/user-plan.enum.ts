import { registerEnumType } from '@nestjs/graphql';

export enum UserPlan {
  FREE = 'FREE',
  BASIC = 'BASIC',
  STAR = 'STAR',
  PREMIUM = 'PREMIUM',
}

registerEnumType(UserPlan, {
  name: 'UserPlan',
  description: 'Plan de suscripción del usuario.',
});

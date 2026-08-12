import { registerEnumType } from '@nestjs/graphql';

export enum PlanCycle {
  MONTHLY = 'MONTHLY',
  YEARLY = 'YEARLY',
}

registerEnumType(PlanCycle, {
  name: 'PlanCycle',
  description: 'Ciclo de facturación del plan del usuario.',
});

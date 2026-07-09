import { registerEnumType } from '@nestjs/graphql';

/** Mirrors the Prisma `PermissionAcces` enum; registered for GraphQL. */
export enum PermissionAcces {
  GRANTED = 'GRANTED',
  DENIED = 'DENIED',
}

registerEnumType(PermissionAcces, {
  name: 'PermissionAcces',
  description: 'Whether a user can access the admin panel.',
});

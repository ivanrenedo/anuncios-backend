import { ObjectType, Field, ID, registerEnumType } from '@nestjs/graphql';
import { UserModel } from '../../users/dto/user.model';

/**
 * Permission verbs a role can perform. Mirrors the Prisma `Action` enum
 * (same string values), declared here so it can be registered with GraphQL.
 */
export enum Action {
  create = 'create',
  read = 'read',
  update = 'update',
  delete = 'delete',
}

registerEnumType(Action, {
  name: 'Action',
  description: 'Permission verbs a role can perform on a resource.',
});

@ObjectType()
export class RolModel {
  @Field(() => ID)
  id: string;

  @Field()
  label: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => [Action])
  actions: Action[];

  /** Id of the user who created the role (maps to the `user_id` column). */
  @Field({ nullable: true })
  createdById?: string;

  /** The user who created the role (null for system/admin-created roles). */
  @Field(() => UserModel, { nullable: true })
  createdBy?: UserModel;

  @Field()
  createdAt: Date;

  @Field({ nullable: true })
  updatedAt?: Date;
}

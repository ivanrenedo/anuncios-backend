import { InputType, Field } from '@nestjs/graphql';
import { PermissionAcces } from './permission.enum';

@InputType()
export class AdminUpdateUserInput {
  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  email?: string;

  @Field({ nullable: true })
  location?: string;

  /** Role id to assign. Empty string disconnects the role. */
  @Field({ nullable: true })
  rolId?: string;

  @Field({ nullable: true })
  verified?: boolean;

  @Field(() => PermissionAcces, { nullable: true })
  permission?: PermissionAcces;
}

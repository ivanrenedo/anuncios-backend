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

  /** Flags the account whose phone/email power `businessContact`. Only one
   *  user can be the business at a time — the service clears the flag on
   *  everyone else when this is set to true. */
  @Field({ nullable: true })
  isBusiness?: boolean;
}

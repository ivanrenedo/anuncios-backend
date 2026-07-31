import { ObjectType, Field, ID, Int } from '@nestjs/graphql';
import { PermissionAcces } from './permission.enum';
import { UserPlan } from './user-plan.enum';

@ObjectType()
export class UserModel {
  @Field(() => ID)
  id: string;

  @Field()
  name: string;

  @Field()
  email: string;

  @Field({ nullable: true })
  phone?: string;

  @Field({ nullable: true })
  avatarUrl?: string;

  @Field({ nullable: true })
  coverUrl?: string;

  @Field({ nullable: true })
  bio?: string;

  @Field({ nullable: true })
  location?: string;

  @Field({ nullable: true })
  rolId?: string;

  @Field()
  language: string;

  @Field()
  verified: boolean;

  @Field(() => PermissionAcces)
  permission: PermissionAcces;

  @Field(() => UserPlan)
  plan: UserPlan;

  @Field({ nullable: true })
  planExpiresAt?: Date;

  /** Plan actually in force (paid plans downgrade to FREE once expired). */
  @Field(() => UserPlan, { nullable: true })
  effectivePlan?: UserPlan;

  /** Max active listings for the effective plan. Null = unlimited. */
  @Field(() => Int, { nullable: true })
  maxActiveProducts?: number;

  @Field(() => Int, { nullable: true })
  maxImagesPerProduct?: number;

  @Field()
  suspended: boolean;

  @Field({ nullable: true })
  suspendedReason?: string;

  @Field()
  isBusiness: boolean;

  @Field()
  notifMessages: boolean;

  @Field()
  notifOffers: boolean;

  @Field()
  notifMarketing: boolean;

  @Field()
  showEmail: boolean;

  @Field()
  showPhone: boolean;

  @Field()
  themePreference: string;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;
}

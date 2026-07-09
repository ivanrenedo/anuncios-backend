import { ObjectType, Field, ID } from '@nestjs/graphql';
import { PermissionAcces } from './permission.enum';

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

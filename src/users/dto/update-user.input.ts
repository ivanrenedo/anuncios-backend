import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class UpdateUserInput {
  @Field({ nullable: true })
  name?: string;

  @Field({ nullable: true })
  email?: string;

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
  language?: string;

  @Field({ nullable: true })
  notifMessages?: boolean;

  @Field({ nullable: true })
  notifOffers?: boolean;

  @Field({ nullable: true })
  notifMarketing?: boolean;

  @Field({ nullable: true })
  showEmail?: boolean;

  @Field({ nullable: true })
  showPhone?: boolean;

  @Field({ nullable: true })
  themePreference?: string;
}

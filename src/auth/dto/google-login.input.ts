import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class GoogleLoginInput {
  @Field()
  googleId: string;

  @Field()
  email: string;

  @Field()
  name: string;

  @Field({ nullable: true })
  avatar?: string;
}

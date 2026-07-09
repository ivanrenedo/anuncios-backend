import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class AdminLoginInput {
  @Field()
  email: string;

  @Field()
  pin: string;
}

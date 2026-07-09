import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class ChangePinInput {
  @Field()
  pinChangeToken: string;

  @Field()
  newPin: string;
}

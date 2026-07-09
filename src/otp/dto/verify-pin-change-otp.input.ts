import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class VerifyPinChangeOtpInput {
  @Field()
  code: string;
}

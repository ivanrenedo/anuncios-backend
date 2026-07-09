import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class VerifyPhoneOtpInput {
  @Field()
  code: string;
}

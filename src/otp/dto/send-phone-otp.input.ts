import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class SendPhoneOtpInput {
  @Field()
  phone: string;
}

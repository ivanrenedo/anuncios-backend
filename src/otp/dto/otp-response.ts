import { ObjectType, Field } from '@nestjs/graphql';

@ObjectType()
export class OtpResponse {
  @Field()
  success: boolean;

  @Field({ nullable: true })
  message?: string;

  @Field({ nullable: true })
  pinChangeToken?: string;
}

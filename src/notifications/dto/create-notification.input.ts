import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class CreateNotificationInput {
  @Field()
  userId: string;

  @Field()
  type: string;

  @Field()
  title: string;

  @Field({ nullable: true })
  body?: string;

  @Field({ nullable: true })
  avatar?: string;
}

import { ObjectType, Field, ID } from '@nestjs/graphql';

@ObjectType()
export class NotificationModel {
  @Field(() => ID)
  id: string;

  @Field()
  userId: string;

  @Field()
  type: string;

  @Field()
  title: string;

  @Field({ nullable: true })
  body?: string;

  @Field()
  read: boolean;

  @Field({ nullable: true })
  avatar?: string;

  @Field({ nullable: true })
  relatedProductId?: string;

  @Field({ nullable: true })
  relatedUserId?: string;

  @Field({ nullable: true })
  sectionId?: string;

  @Field({ nullable: true })
  filterCat?: string;

  @Field()
  createdAt: Date;
}

import { InputType, Field } from '@nestjs/graphql';
import { IsNotEmpty, MaxLength } from 'class-validator';

/** Payload for admin broadcasts (marketing campaigns / system announcements). */
@InputType()
export class BroadcastInput {
  @Field()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @Field({ nullable: true })
  @MaxLength(1000)
  body?: string;

  /** Optional avatar/illustration URL to show alongside the notification. */
  @Field({ nullable: true })
  avatar?: string;

  @Field({ nullable: true })
  sectionId?: string;

  @Field({ nullable: true })
  filterCat?: string;
}

import { InputType, Field, Int } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';

@InputType()
export class CreateHomeSectionInput {
  @Field()
  type: string;

  @Field()
  title: string;

  @Field({ nullable: true })
  subtitle?: string;

  @Field({ nullable: true })
  icon?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  filter?: any;

  @Field(() => GraphQLJSON, { nullable: true })
  config?: any;

  @Field(() => Int, { nullable: true, defaultValue: 0 })
  sortOrder?: number;

  @Field({ nullable: true, defaultValue: true })
  visible?: boolean;

  @Field({ nullable: true, defaultValue: false })
  notifyOnCreate?: boolean;

  @Field(() => Int, { nullable: true, defaultValue: 0 })
  minResults?: number;

  @Field({ nullable: true })
  startsAt?: Date;

  @Field({ nullable: true })
  endsAt?: Date;
}

@InputType()
export class UpdateHomeSectionInput {
  @Field({ nullable: true })
  type?: string;

  @Field({ nullable: true })
  title?: string;

  @Field({ nullable: true })
  subtitle?: string;

  @Field({ nullable: true })
  icon?: string;

  @Field(() => GraphQLJSON, { nullable: true })
  filter?: any;

  @Field(() => GraphQLJSON, { nullable: true })
  config?: any;

  @Field(() => Int, { nullable: true })
  sortOrder?: number;

  @Field({ nullable: true })
  visible?: boolean;

  @Field({ nullable: true })
  notifyOnCreate?: boolean;

  @Field(() => Int, { nullable: true })
  minResults?: number;

  @Field({ nullable: true })
  startsAt?: Date;

  @Field({ nullable: true })
  endsAt?: Date;
}

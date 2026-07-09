import { ObjectType, Field, ID, Int, Float } from '@nestjs/graphql';
import { GraphQLJSON } from 'graphql-type-json';
import { UserModel } from '../../users/dto/user.model';
import { ProductModel } from '../../products/models/product.model';
import { HomeSuggestionStatus } from './home-section.enums';

@ObjectType()
export class HomeSectionModel {
  @Field(() => ID)
  id: string;

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

  @Field(() => Int)
  sortOrder: number;

  @Field()
  visible: boolean;

  @Field()
  notifyOnCreate: boolean;

  @Field(() => Int)
  minResults: number;

  @Field({ nullable: true })
  startsAt?: Date;

  @Field({ nullable: true })
  endsAt?: Date;

  @Field({ nullable: true })
  createdById?: string;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;

  @Field(() => UserModel, { nullable: true })
  createdBy?: UserModel;

  @Field(() => [ProductModel], { nullable: true })
  products?: ProductModel[];
}

@ObjectType()
export class HomeSuggestionModel {
  @Field(() => ID)
  id: string;

  @Field()
  type: string;

  @Field()
  title: string;

  @Field()
  reason: string;

  @Field(() => GraphQLJSON)
  filter: any;

  @Field(() => Float)
  score: number;

  @Field(() => HomeSuggestionStatus)
  status: HomeSuggestionStatus;

  @Field({ nullable: true })
  reviewedById?: string;

  @Field({ nullable: true })
  reviewedAt?: Date;

  @Field()
  createdAt: Date;

  @Field(() => UserModel, { nullable: true })
  reviewedBy?: UserModel;
}

@ObjectType()
export class HomeSectionStats {
  @Field()
  sectionId: string;

  @Field(() => Int)
  impressions: number;

  @Field(() => Int)
  clicks: number;

  @Field(() => Float)
  ctr: number;
}

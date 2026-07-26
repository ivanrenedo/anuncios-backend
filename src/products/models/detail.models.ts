import { ObjectType, Field, ID, Int } from '@nestjs/graphql';

@ObjectType()
export class MarketplaceDetailModel {
  @Field(() => ID)
  id: string;

  @Field({ nullable: true })
  brand?: string;

  @Field({ nullable: true })
  model?: string;

  @Field(() => [String])
  colors: string[];
}

@ObjectType()
export class VehicleDetailModel {
  @Field(() => ID)
  id: string;

  @Field({ nullable: true })
  operation?: string;

  @Field({ nullable: true })
  brand?: string;

  @Field({ nullable: true })
  model?: string;

  @Field(() => Int, { nullable: true })
  year?: number;

  @Field(() => Int, { nullable: true })
  kilometrage?: number;

  @Field({ nullable: true })
  transmission?: string;

  @Field({ nullable: true })
  engine?: string;

  @Field(() => [String])
  colors: string[];
}

@ObjectType()
export class PropertyDetailModel {
  @Field(() => ID)
  id: string;

  @Field({ nullable: true })
  operation?: string;

  @Field(() => Int)
  bedrooms: number;

  @Field(() => Int)
  bathrooms: number;

  @Field(() => Int)
  floor: number;

  @Field(() => Int)
  surface: number;

  @Field({ nullable: true })
  address?: string;
}

@ObjectType()
export class ServiceDetailModel {
  @Field(() => ID)
  id: string;

  @Field({ nullable: true })
  offerType?: string;
}

@ObjectType()
export class JobDetailModel {
  @Field(() => ID)
  id: string;

  @Field({ nullable: true })
  link?: string;
}

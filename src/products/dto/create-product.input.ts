import { InputType, Field, Float, Int } from '@nestjs/graphql';

@InputType()
export class CreateMarketplaceDetailInput {
  @Field({ nullable: true })
  brand?: string;

  @Field({ nullable: true })
  model?: string;

  @Field(() => [String], { nullable: true })
  colors?: string[];
}

@InputType()
export class CreateVehicleDetailInput {
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

  @Field(() => [String], { nullable: true })
  colors?: string[];
}

@InputType()
export class CreatePropertyDetailInput {
  @Field({ nullable: true })
  operation?: string;

  @Field(() => Int, { nullable: true, defaultValue: 0 })
  bedrooms?: number;

  @Field(() => Int, { nullable: true, defaultValue: 0 })
  bathrooms?: number;

  @Field(() => Int, { nullable: true, defaultValue: 0 })
  floor?: number;

  @Field(() => Int, { nullable: true, defaultValue: 0 })
  surface?: number;

  @Field({ nullable: true })
  address?: string;
}

@InputType()
export class CreateServiceDetailInput {
  @Field({ nullable: true })
  offerType?: string;
}

@InputType()
export class CreateJobDetailInput {
  @Field({ nullable: true })
  link?: string;
}

@InputType()
export class ProductAttributeInput {
  @Field()
  label: string;

  @Field()
  value: string;
}

@InputType()
export class MediaItemInput {
  @Field()
  url: string;

  /** 'image' | 'video' — validated in the resolver against the DB enum. */
  @Field({ defaultValue: 'image' })
  type: string;

  /** Required for videos so the UI has something to render as a preview. */
  @Field({ nullable: true })
  thumbnailUrl?: string;
}

@InputType()
export class CreateProductInput {
  @Field()
  categoryId: string;

  @Field()
  title: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => Float)
  price: number;

  @Field(() => Int, { nullable: true })
  discount?: number;

  @Field({ nullable: true })
  condition?: string;

  @Field({ nullable: true })
  city?: string;

  @Field(() => [String], { nullable: true })
  imageUrls?: string[];

  /** Preferred over `imageUrls`. Supports both images and videos with
   *  thumbnails. If both are provided, `mediaItems` wins. */
  @Field(() => [MediaItemInput], { nullable: true })
  mediaItems?: MediaItemInput[];

  @Field(() => [ProductAttributeInput], { nullable: true })
  attributes?: ProductAttributeInput[];

  @Field(() => CreateMarketplaceDetailInput, { nullable: true })
  marketplaceDetail?: CreateMarketplaceDetailInput;

  @Field(() => CreateVehicleDetailInput, { nullable: true })
  vehicleDetail?: CreateVehicleDetailInput;

  @Field(() => CreatePropertyDetailInput, { nullable: true })
  propertyDetail?: CreatePropertyDetailInput;

  @Field(() => CreateServiceDetailInput, { nullable: true })
  serviceDetail?: CreateServiceDetailInput;

  @Field(() => CreateJobDetailInput, { nullable: true })
  jobDetail?: CreateJobDetailInput;
}

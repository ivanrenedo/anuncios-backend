import { InputType, Field, Float, Int } from '@nestjs/graphql';
import {
  CreateMarketplaceDetailInput,
  CreateVehicleDetailInput,
  CreatePropertyDetailInput,
  CreateServiceDetailInput,
  CreateJobDetailInput,
} from './create-product.input';

@InputType()
export class UpdateProductInput {
  @Field({ nullable: true })
  title?: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => Float, { nullable: true })
  price?: number;

  @Field(() => Int, { nullable: true })
  discount?: number;

  @Field({ nullable: true })
  condition?: string;

  @Field({ nullable: true })
  city?: string;

  @Field({ nullable: true })
  status?: string;

  @Field({ nullable: true })
  categoryId?: string;

  @Field(() => [String], { nullable: true })
  imageUrls?: string[];

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

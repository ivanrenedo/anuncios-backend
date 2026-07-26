import { ObjectType, Field, ID, Int, Float } from '@nestjs/graphql';
import { CategoryModel } from '../../categories/dto/category.model';
import { UserModel } from '../../users/dto/user.model';
import {
  MarketplaceDetailModel,
  VehicleDetailModel,
  PropertyDetailModel,
  ServiceDetailModel,
  JobDetailModel,
} from './detail.models';

@ObjectType()
export class DailyCountModel {
  /** Day in YYYY-MM-DD (UTC). */
  @Field()
  date: string;

  @Field(() => Int)
  count: number;
}

@ObjectType()
export class ProductImageModel {
  @Field(() => ID)
  id: string;

  @Field()
  url: string;

  @Field(() => Int)
  sortOrder: number;

  /** 'image' or 'video'. Kept as a string to avoid dragging the Prisma enum
   *  into the GraphQL layer — the set of values is small and stable. */
  @Field()
  type: string;

  @Field({ nullable: true })
  thumbnailUrl?: string;
}

@ObjectType()
export class ProductAttributeModel {
  @Field(() => ID)
  id: string;

  @Field()
  label: string;

  @Field()
  value: string;
}

@ObjectType()
export class ProductModel {
  @Field(() => ID)
  id: string;

  @Field()
  sellerId: string;

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

  @Field()
  status: string;

  @Field(() => Int)
  views: number;

  @Field(() => Int)
  favoritesCount: number;

  /** Times a buyer tapped the WhatsApp/call contact button. */
  @Field(() => Int)
  contacts: number;

  /** Times the listing appeared in search results. */
  @Field(() => Int)
  impressions: number;

  @Field()
  bumpedAt: Date;

  @Field({ nullable: true })
  boostedUntil?: Date;

  @Field()
  createdAt: Date;

  @Field()
  updatedAt: Date;

  @Field(() => UserModel, { nullable: true })
  seller?: UserModel;

  @Field(() => CategoryModel, { nullable: true })
  category?: CategoryModel;

  @Field(() => [ProductImageModel], { nullable: true })
  images?: ProductImageModel[];

  @Field(() => [ProductAttributeModel], { nullable: true })
  attributes?: ProductAttributeModel[];

  @Field(() => MarketplaceDetailModel, { nullable: true })
  marketplaceDetail?: MarketplaceDetailModel;

  @Field(() => VehicleDetailModel, { nullable: true })
  vehicleDetail?: VehicleDetailModel;

  @Field(() => PropertyDetailModel, { nullable: true })
  propertyDetail?: PropertyDetailModel;

  @Field(() => ServiceDetailModel, { nullable: true })
  serviceDetail?: ServiceDetailModel;

  @Field(() => JobDetailModel, { nullable: true })
  jobDetail?: JobDetailModel;
}

import { InputType, Field } from '@nestjs/graphql';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsOptional,
  MaxLength,
} from 'class-validator';
import { UserPlan } from '../../users/dto/user-plan.enum';

/**
 * Partial update of the promo singleton: every field is optional so the panel
 * can flip one switch without resending the whole form.
 */
@InputType()
export class UpdatePlanPromoInput {
  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsDate()
  startsAt?: Date | null;

  @Field({ nullable: true })
  @IsOptional()
  @IsDate()
  endsAt?: Date | null;

  @Field(() => UserPlan, { nullable: true })
  @IsOptional()
  @IsEnum(UserPlan)
  grantedPlan?: UserPlan;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  unlockLimits?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  unlockPinned?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  unlockAutoBump?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  unlockStats?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @IsBoolean()
  freeBoosts?: boolean;

  @Field({ nullable: true })
  @IsOptional()
  @MaxLength(160)
  bannerText?: string | null;
}

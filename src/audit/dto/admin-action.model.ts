import { ObjectType, Field, ID } from '@nestjs/graphql';
import { UserModel } from '../../users/dto/user.model';

@ObjectType()
export class AdminActionModel {
  @Field(() => ID)
  id: string;

  /** hide_product | restore_product | suspend_user | unsuspend_user | boost | unboost | bump | change_plan | update_product | delete_image | delete_payment */
  @Field()
  action: string;

  @Field()
  targetType: string;

  @Field()
  targetId: string;

  @Field({ nullable: true })
  detail?: string;

  @Field()
  createdAt: Date;

  @Field(() => UserModel, { nullable: true })
  admin?: UserModel;
}

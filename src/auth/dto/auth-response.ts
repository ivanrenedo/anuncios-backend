import { ObjectType, Field } from '@nestjs/graphql';
import { UserModel } from '../../users/dto/user.model';

@ObjectType()
export class AuthResponse {
  @Field()
  accessToken: string;

  @Field()
  refreshToken: string;

  @Field(() => UserModel, { nullable: true })
  user?: UserModel;
}

import { InputType, Field } from '@nestjs/graphql';
import { Action } from './rol.model';

@InputType()
export class UpdateRolInput {
  @Field({ nullable: true })
  label?: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => [Action], { nullable: true })
  actions?: Action[];
}

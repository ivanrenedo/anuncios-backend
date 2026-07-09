import { InputType, Field } from '@nestjs/graphql';
import { Action } from './rol.model';

@InputType()
export class CreateRolInput {
  @Field()
  label: string;

  @Field({ nullable: true })
  description?: string;

  @Field(() => [Action], { nullable: true })
  actions?: Action[];
}

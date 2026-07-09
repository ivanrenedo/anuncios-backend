import { InputType, Field } from '@nestjs/graphql';
import { DEFAULT_PIN } from '../../common/pin.util';

@InputType()
export class CreateUserInput {
  @Field()
  name: string;

  @Field()
  email: string;

  /**
   * Default reflected in the GraphQL schema (`pin: String! = "246810"`) from the
   * shared `DEFAULT_PIN` constant. Hashed before being persisted.
   */
  @Field(() => String, { defaultValue: DEFAULT_PIN })
  pin: string;

  @Field({ nullable: true })
  location?: string;

  /** Optional role to assign to the new user. */
  @Field({ nullable: true })
  rolId?: string;
}

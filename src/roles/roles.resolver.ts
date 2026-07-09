import { Resolver, Query, Mutation, Args } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/guards/admin.guard';
import { RolesService } from './roles.service';
import { RolModel } from './dto/rol.model';
import { CreateRolInput } from './dto/create-rol.input';
import { UpdateRolInput } from './dto/update-rol.input';
import { GetCurrentUserId } from '../auth/decorators/current-user.decorator';

@Resolver(() => RolModel)
@UseGuards(AdminGuard)
export class RolesResolver {
  constructor(private service: RolesService) {}

  @Query(() => [RolModel])
  async roles() {
    return this.service.findAll();
  }

  @Query(() => RolModel)
  async rol(@Args('id') id: string) {
    return this.service.findOne(id);
  }

  @Mutation(() => RolModel)
  async createRol(
    @Args('input') input: CreateRolInput,
    @GetCurrentUserId() createdById: string,
  ) {
    return this.service.create(input, createdById);
  }

  @Mutation(() => RolModel)
  async updateRol(
    @Args('id') id: string,
    @Args('input') input: UpdateRolInput,
  ) {
    return this.service.update(id, input);
  }

  @Mutation(() => RolModel)
  async deleteRol(@Args('id') id: string) {
    return this.service.remove(id);
  }
}

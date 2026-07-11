import { Resolver, Query, Mutation, Args, Int } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentModel } from './dto/payment.model';
import { AdminGuard } from '../auth/guards/admin.guard';

@Resolver(() => PaymentModel)
export class PaymentsResolver {
  constructor(private service: PaymentsService) {}

  @Query(() => [PaymentModel])
  @UseGuards(AdminGuard)
  async payments(
    @Args('take', { type: () => Int, nullable: true }) take?: number,
    @Args('skip', { type: () => Int, nullable: true }) skip?: number,
  ) {
    return this.service.findAll(take ?? 200, skip ?? 0);
  }

  @Mutation(() => PaymentModel)
  @UseGuards(AdminGuard)
  async deletePayment(@Args('id') id: string) {
    return this.service.remove(id);
  }
}

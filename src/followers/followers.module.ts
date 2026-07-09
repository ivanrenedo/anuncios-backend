import { Module } from '@nestjs/common';
import { FollowersService } from './followers.service';
import { FollowersResolver } from './followers.resolver';

@Module({
  providers: [FollowersService, FollowersResolver],
  exports: [FollowersService],
})
export class FollowersModule {}

import { Injectable, ForbiddenException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationEvents } from '../notifications/notifications.events';

@Injectable()
export class FollowersService {
  constructor(
    private prisma: PrismaService,
    private events: EventEmitter2,
  ) {}

  async follow(followerId: string, followedId: string) {
    if (followerId === followedId) {
      throw new ForbiddenException('No puedes seguirte a ti mismo');
    }
    const created = await this.prisma.follower.create({
      data: { followerId, followedId },
      include: { follower: true, followed: true },
    });

    this.events.emit(NotificationEvents.UserFollowed, {
      followerId,
      followerName: created.follower.name,
      followerAvatarUrl: created.follower.avatarUrl,
      followedId,
    });
    return created;
  }

  async unfollow(followerId: string, followedId: string) {
    return this.prisma.follower.delete({
      where: {
        followerId_followedId: { followerId, followedId },
      },
    });
  }

  async isFollowing(followerId: string, followedId: string) {
    const record = await this.prisma.follower.findUnique({
      where: {
        followerId_followedId: { followerId, followedId },
      },
    });
    return !!record;
  }

  async getFollowers(userId: string) {
    return this.prisma.follower.findMany({
      where: { followedId: userId },
      include: { follower: true },
    });
  }

  async getFollowing(userId: string) {
    return this.prisma.follower.findMany({
      where: { followerId: userId },
      include: { followed: true },
    });
  }

  async followersCount(userId: string) {
    return this.prisma.follower.count({ where: { followedId: userId } });
  }

  async followingCount(userId: string) {
    return this.prisma.follower.count({ where: { followerId: userId } });
  }
}

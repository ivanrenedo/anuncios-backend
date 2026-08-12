import { Resolver, Query, Mutation, Args, Context } from '@nestjs/graphql';
import { UseGuards } from '@nestjs/common';
import { SellerQrScansService } from './seller-qr-scans.service';
import { SellerQrStatsModel } from './dto/seller-qr-stats.model';
import { GqlAuthGuard } from '../auth/guards/gql-auth.guard';
import { GetCurrentUserId } from '../auth/decorators/current-user.decorator';

/** Extract the caller's IP, honouring the reverse-proxy `x-forwarded-for`
 *  header when present. The first hop is the original client. */
function extractIp(req: any): string | null {
  if (!req) return null;
  const xff = req.headers?.['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0]?.trim() || null;
  }
  if (Array.isArray(xff) && xff.length > 0) {
    return String(xff[0]).split(',')[0]?.trim() || null;
  }
  return (req.ip as string) || req.socket?.remoteAddress || null;
}

function extractUserAgent(req: any): string | null {
  const ua = req?.headers?.['user-agent'];
  return typeof ua === 'string' ? ua : null;
}

@Resolver()
export class SellerQrScansResolver {
  constructor(private readonly service: SellerQrScansService) {}

  /**
   * Public — called by the seller's profile page (web + mobile) when the URL
   * carries `?src=qr`. Returns `true` when a scan was recorded, `false` when
   * it was deduped or the seller is not on a plan that unlocks the feature.
   */
  @Mutation(() => Boolean)
  async trackSellerQrScan(
    @Args('sellerId') sellerId: string,
    @Context() ctx: any,
    @Args('source', { nullable: true }) source?: string,
  ): Promise<boolean> {
    const req = ctx?.req;
    return this.service.track({
      sellerId,
      source,
      ip: extractIp(req),
      userAgent: extractUserAgent(req),
    });
  }

  /** Stats for the caller's own QR — never exposes another seller's data. */
  @Query(() => SellerQrStatsModel)
  @UseGuards(GqlAuthGuard)
  async mySellerQrStats(
    @GetCurrentUserId() userId: string,
  ): Promise<SellerQrStatsModel> {
    return this.service.myStats(userId);
  }
}

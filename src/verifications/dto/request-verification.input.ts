import { InputType, Field } from '@nestjs/graphql';

@InputType()
export class RequestVerificationInput {
  /**
   * URLs of documents the user uploaded to support the request (ID card,
   * business licence, selfie holding ID, etc.). Stored verbatim on
   * `VerificationRequest.docs` so the reviewing admin sees the full evidence
   * packet in one place. Optional — legacy clients can still request
   * verification without uploads, but Premium reviewers may reject.
   */
  @Field(() => [String], { nullable: true })
  docs?: string[];
}

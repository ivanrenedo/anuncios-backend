import { ArgumentsHost, Catch, ExceptionFilter } from '@nestjs/common';
import { GqlArgumentsHost } from '@nestjs/graphql';
import { GraphQLError } from 'graphql';

// Returning the exception (instead of throwing or logging) hands it to the
// GraphQL driver's error formatter without going through Nest's default
// ExceptionsHandler, which is what was logging `NO_SESSION` at ERROR level
// on every guest / expired-token request.
@Catch(GraphQLError)
export class GraphQLExceptionFilter implements ExceptionFilter {
  catch(exception: GraphQLError, host: ArgumentsHost) {
    GqlArgumentsHost.create(host);
    return exception;
  }
}

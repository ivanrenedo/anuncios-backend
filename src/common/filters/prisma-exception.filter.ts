import {
  ArgumentsHost,
  Catch,
  ConflictException,
  HttpException,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { Prisma } from '@prisma/client';

/**
 * Global filter that turns raw Prisma errors into clean, user-facing messages
 * in Spanish. Without it, a unique-constraint violation surfaces to the client
 * as "Unique constraint failed on the (not available)".
 *
 * Delegates to BaseExceptionFilter so it works for both GraphQL (the resolvers)
 * and REST (the upload/auth controllers).
 */
@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientValidationError)
export class PrismaExceptionFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(PrismaExceptionFilter.name);

  catch(
    exception:
      | Prisma.PrismaClientKnownRequestError
      | Prisma.PrismaClientValidationError,
    host: ArgumentsHost,
  ) {
    // Log every Prisma error before mapping — the user-facing message
    // deliberately hides the underlying cause, so without this line the only
    // trace left of a schema drift or a missing SQL function is a generic
    // "No se pudo completar la operación" toast on the client.
    const code =
      exception instanceof Prisma.PrismaClientKnownRequestError
        ? exception.code
        : 'ValidationError';
    this.logger.error(
      `Prisma error ${code}: ${exception.message.replace(/\s+/g, ' ').trim()}`,
    );

    const httpException = this.toHttpException(exception);

    // BaseExceptionFilter only knows how to reply to a real HTTP request. In a
    // GraphQL context there's no Express response (host arg 0 is the GraphQL
    // root), so calling super.catch() blows up with "response.status is not a
    // function". For GraphQL (and anything non-HTTP) we rethrow the mapped
    // HttpException and let Apollo serialize its message.
    if (host.getType() === 'http') {
      super.catch(httpException, host);
      return;
    }
    throw httpException;
  }

  private toHttpException(
    exception:
      | Prisma.PrismaClientKnownRequestError
      | Prisma.PrismaClientValidationError,
  ): HttpException {
    if (exception instanceof Prisma.PrismaClientValidationError) {
      return new UnprocessableEntityException(
        'Datos inválidos. Revisa la información e inténtalo de nuevo.',
      );
    }

    switch (exception.code) {
      // Unique constraint failed
      case 'P2002': {
        const target = exception.meta?.target;
        const fields = Array.isArray(target) ? target.join(', ') : null;
        return new ConflictException(
          fields
            ? `Ya existe un registro con ese valor: ${fields}.`
            : 'Ya existe un registro con esos datos (valor duplicado).',
        );
      }
      // Record not found (e.g. update/delete of a missing row)
      case 'P2025':
        return new NotFoundException('No se encontró el registro solicitado.');
      // Foreign key constraint failed
      case 'P2003':
        return new ConflictException(
          'No se puede completar: el registro está vinculado a otros datos.',
        );
      // Required relation violation
      case 'P2014':
        return new ConflictException(
          'La operación viola una relación requerida entre registros.',
        );
      // Raw query failure — usually a missing SQL function, extension, or
      // column referenced by `$queryRaw`. The underlying Postgres message is
      // already logged above; in non-production surface it so devs don't have
      // to tail the server to figure out what broke.
      case 'P2010': {
        const isProd = process.env.NODE_ENV === 'production';
        if (isProd) {
          return new InternalServerErrorException(
            'No se pudo completar la operación. Inténtalo de nuevo.',
          );
        }
        const meta = exception.meta as
          | { code?: string; message?: string }
          | undefined;
        const detail = meta?.message ?? exception.message;
        return new InternalServerErrorException(
          `Error de base de datos (${meta?.code ?? 'P2010'}): ${detail}`,
        );
      }
      default:
        return new InternalServerErrorException(
          'No se pudo completar la operación. Inténtalo de nuevo.',
        );
    }
  }
}

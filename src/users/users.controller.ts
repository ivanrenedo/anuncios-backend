import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';

/**
 * Legacy share-link endpoint. See ProductsController for the rationale — we
 * now share `https://bomelh.com/user/<id>` and the app opens via App Links /
 * Universal Links. This endpoint 301-redirects any old `.../u/<id>` link.
 */
@Controller('u')
export class UsersController {
  @Get(':id')
  legacyRedirect(@Param('id') id: string, @Res() res: Response) {
    return res.redirect(301, `https://bomelh.com/user/${id}`);
  }
}

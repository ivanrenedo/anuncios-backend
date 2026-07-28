import { Controller, Get, Param, Res } from '@nestjs/common';
import { Response } from 'express';

/**
 * Legacy share-link endpoint. Existing links in the wild point at
 * `https://api.bomelh.com/p/<id>`. We now share `https://bomelh.com/product/<id>`
 * and let Android App Links / iOS Universal Links open the app; the OG preview
 * card is served by the Next.js page. This endpoint only exists to keep old
 * links alive by 301-redirecting to the new canonical URL.
 */
@Controller('p')
export class ProductsController {
  @Get(':id')
  legacyRedirect(@Param('id') id: string, @Res() res: Response) {
    return res.redirect(301, `https://bomelh.com/product/${id}`);
  }
}

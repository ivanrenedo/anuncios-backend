import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { ProductsService } from './products.service';

@Controller('p')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get(':id')
  async ogPage(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    let product: any;
    try {
      product = await this.products.findOne(id);
    } catch {
      return res.status(404).send('Not found');
    }

    const title = product.title;
    const description = product.description
      ? product.description.slice(0, 200)
      : title;
    const image = product.images?.[0]?.url?.startsWith('/')
      ? `${baseUrl}${product.images[0].url}`
      : product.images?.[0]?.url || '';
    const url = `${baseUrl}/p/${id}`;
    const deepLink = `marketeg://product/${id}`;

    const priceNum = Number(product.price);
    const priceText =
      priceNum > 0 ? `${priceNum.toLocaleString('es-GQ')} XAF` : '';
    const ogDesc = priceText ? `${priceText} — ${description}` : description;

    const sellerName = product.seller?.name || '';
    const sellerAvatar = product.seller?.avatarUrl
      ? product.seller.avatarUrl.startsWith('/')
        ? `${baseUrl}${product.seller.avatarUrl}`
        : product.seller.avatarUrl
      : '';
    const category = product.category?.label || '';
    const city = product.city || '';

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — Market EG</title>
<meta property="og:type" content="product">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(ogDesc)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:width" content="800">
<meta property="og:image:height" content="800">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="Market EG">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(ogDesc)}">
<meta name="twitter:image" content="${esc(image)}">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,system-ui,sans-serif;background:#f5f5f5;color:#1a1a1a;min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:#fff;border-radius:16px;max-width:400px;width:90%;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,.08)}
.img-wrap{width:100%;aspect-ratio:1;background:#eee;position:relative}
.img-wrap img{width:100%;height:100%;object-fit:cover}
.badge{position:absolute;top:12px;left:12px;background:rgba(0,0,0,.6);color:#fff;padding:3px 10px;border-radius:12px;font-size:12px;font-weight:600}
.body{padding:16px 20px 20px}
.cat{font-size:12px;color:#888;margin-bottom:4px}
h1{font-size:18px;font-weight:700;line-height:1.3;margin-bottom:6px}
.price{font-size:22px;font-weight:700;color:#1a1a1a;margin-bottom:14px}
.seller{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid #f0f0f0}
.seller img{width:36px;height:36px;border-radius:50%;object-fit:cover;background:#eee}
.seller-name{font-size:14px;font-weight:600}
.seller-loc{font-size:12px;color:#888}
.cta{display:block;text-align:center;background:#1a1a1a;color:#fff;padding:14px;border-radius:12px;font-size:15px;font-weight:600;text-decoration:none;margin-top:14px}
.fallback{text-align:center;font-size:13px;color:#999;margin-top:12px}
</style>
</head>
<body>
<div class="card">
${image ? `<div class="img-wrap"><img src="${esc(image)}" alt="${esc(title)}">${category ? `<span class="badge">${esc(category)}</span>` : ''}</div>` : ''}
<div class="body">
${category ? `<p class="cat">${esc(category)}</p>` : ''}
<h1>${esc(title)}</h1>
${priceText ? `<p class="price">${esc(priceText)}</p>` : ''}
${sellerName ? `<div class="seller">${sellerAvatar ? `<img src="${esc(sellerAvatar)}" alt="">` : ''}<div><p class="seller-name">${esc(sellerName)}</p>${city ? `<p class="seller-loc">${esc(city)}</p>` : ''}</div></div>` : ''}
<a class="cta" id="open" href="${esc(deepLink)}">Abrir en Market EG</a>
<p class="fallback" id="fallback" style="display:none">Si no se abre, descarga Market EG desde la tienda de aplicaciones.</p>
</div>
</div>
<script>
var dl="${deepLink.replace(/"/g, '\\"')}";
var t=setTimeout(function(){document.getElementById("fallback").style.display="block"},1500);
window.location.href=dl;
</script>
</body>
</html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

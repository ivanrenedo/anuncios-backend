import { Controller, Get, Param, Req, Res } from '@nestjs/common';
import { Request, Response } from 'express';
import { UsersService } from './users.service';

@Controller('u')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get(':id')
  async ogPage(
    @Param('id') id: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const baseUrl = `${req.protocol}://${req.get('host')}`;

    let user: any;
    try {
      user = await this.users.findOne(id);
    } catch {
      return res.status(404).send('Not found');
    }

    const name = user.name || 'Perfil';
    const title = `${name} — Bomelh`;
    const bio = user.bio ? String(user.bio).slice(0, 200) : '';
    const description = bio || `Mira el perfil de ${name} en Bomelh`;

    const resolveAsset = (u?: string | null) =>
      u ? (u.startsWith('/') ? `${baseUrl}${u}` : u) : '';
    const avatar = resolveAsset(user.avatarUrl);
    const cover = resolveAsset(user.coverUrl);
    const image = cover || avatar;

    const url = `${baseUrl}/u/${id}`;
    const deepLink = `bomelh://u/${id}`;

    const location = user.location || '';
    const memberSince = user.createdAt
      ? new Date(user.createdAt).getFullYear()
      : '';
    const verified = !!user.verified;
    const plan = user.effectivePlan ?? user.plan ?? 'FREE';

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta property="og:type" content="profile">
<meta property="og:title" content="${esc(name)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:site_name" content="Bomelh">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(name)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(image)}">
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,system-ui,sans-serif;background:#f5f5f5;color:#1a1a1a;min-height:100vh;display:flex;align-items:center;justify-content:center}
.card{background:#fff;border-radius:16px;max-width:400px;width:90%;overflow:hidden;box-shadow:0 2px 20px rgba(0,0,0,.08)}
.cover{width:100%;aspect-ratio:16/9;background:#eee;position:relative;overflow:hidden}
.cover img{width:100%;height:100%;object-fit:cover}
.avatar-wrap{display:flex;justify-content:center;margin-top:-44px;position:relative;z-index:1}
.avatar{width:88px;height:88px;border-radius:50%;background:#eee;border:4px solid #fff;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08)}
.avatar img{width:100%;height:100%;object-fit:cover}
.avatar-fallback{width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#006b5e;color:#fff;font-size:32px;font-weight:700}
.body{padding:12px 20px 20px;text-align:center}
.name-row{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:6px}
h1{font-size:20px;font-weight:700;line-height:1.3}
.verified{display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#006b5e;color:#fff;font-size:11px;font-weight:700}
.meta{font-size:13px;color:#888;margin-top:6px}
.bio{font-size:14px;color:#444;margin-top:12px;line-height:1.5}
.plan{display:inline-block;margin-top:10px;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600}
.plan-star{background:#fff5db;color:#a17300}
.plan-premium{background:#efe6ff;color:#5a2ca8}
.cta{display:block;text-align:center;background:#1a1a1a;color:#fff;padding:14px;border-radius:12px;font-size:15px;font-weight:600;text-decoration:none;margin-top:16px}
.fallback{text-align:center;font-size:13px;color:#999;margin-top:12px}
</style>
</head>
<body>
<div class="card">
<div class="cover">${cover ? `<img src="${esc(cover)}" alt="">` : ''}</div>
<div class="avatar-wrap"><div class="avatar">${avatar ? `<img src="${esc(avatar)}" alt="${esc(name)}">` : `<div class="avatar-fallback">${esc((name.charAt(0) || '?').toUpperCase())}</div>`}</div></div>
<div class="body">
<div class="name-row"><h1>${esc(name)}</h1>${verified ? '<span class="verified" title="Verificado">✓</span>' : ''}</div>
${location || memberSince ? `<p class="meta">${esc([location, memberSince ? `Desde ${memberSince}` : ''].filter(Boolean).join(' · '))}</p>` : ''}
${plan === 'STAR' ? '<span class="plan plan-star">★ Estrella</span>' : plan === 'PREMIUM' ? '<span class="plan plan-premium">♛ Premium</span>' : ''}
${bio ? `<p class="bio">${esc(bio)}</p>` : ''}
<a class="cta" id="open" href="${esc(deepLink)}">Abrir en Bomelh</a>
<p class="fallback" id="fallback" style="display:none">Si no se abre, descarga Bomelh desde la tienda de aplicaciones.</p>
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

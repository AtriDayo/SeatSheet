# VPS Deployment

This project is ready for a single VPS deployment with Docker Compose.

## 1. DNS

In Cloudflare, create DNS-only records:

| Type | Name | Target |
| --- | --- | --- |
| A | `seats` | Your VPS IPv4 |
| A | `seats-config` | Your VPS IPv4 |

Keep the proxy status as DNS only if you want Cloudflare to only resolve the domain name.

## 2. Server

Install Docker and Docker Compose on the VPS, then clone the project.

Update `deploy/docker-compose.yml` before production:

- Replace `seatsheet_change_me` with a strong database password.
- Keep `CORS_ORIGIN` aligned with your real domains.

Start services:

```bash
docker compose -f deploy/docker-compose.yml up -d --build
```

Run migrations:

```bash
docker compose -f deploy/docker-compose.yml exec backend npm run prisma:deploy
```

Optional seed:

```bash
npm install
DATABASE_URL="postgresql://seatsheet:seatsheet_change_me@YOUR_VPS_IP:5432/seatsheet?schema=public" npm run prisma:seed --workspace backend
```

## 3. Reverse Proxy

The app container listens on `127.0.0.1:8080` from the VPS perspective.

Use either:

- `deploy/nginx-vps.example.conf`
- `deploy/caddy.example`

For HTTPS, install a certificate with Certbot if using Nginx, or let Caddy issue certificates automatically.

## 4. URL Plan

The simplest production layout is:

- Display: `https://seats.atridayo.com/`
- Config: `https://seats.atridayo.com/config`

If you prefer a separated config subdomain:

- Display: `https://seats.atridayo.com/`
- Config: `https://seats-config.atridayo.com/`

The example reverse proxy redirects `seats-config.atridayo.com/` to `/config` on the same frontend app.

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

The frontend is exposed on host port `30080` by default:

- Display: `http://YOUR_VPS_IP:30080/`
- Config: `http://YOUR_VPS_IP:30080/config`

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

The app container listens on `127.0.0.1:30080` from the VPS perspective.

Use either:

- `deploy/nginx-vps.example.conf`
- `deploy/caddy.example`

For HTTPS, install a certificate with Certbot if using Nginx, or let Caddy issue certificates automatically.

If your VPS provider blocks unregistered domains or common web ports, DNS-only records cannot remove the need for a port. Without usable `80` or `443`, access URLs must include the port, such as `http://seats.atridayo.com:30080/`. To use `https://seats.atridayo.com/` without a port on a mainland China VPS, you usually need ICP filing for the domain, a provider-approved web port, or a different network path such as an overseas VPS or Cloudflare Tunnel/proxy.

## 4. URL Plan

The simplest production layout is:

- Display: `https://seats.atridayo.com/`
- Config: `https://seats.atridayo.com/config`

If `80` and `443` are unavailable, use:

- Display: `http://seats.atridayo.com:30080/`
- Config: `http://seats.atridayo.com:30080/config`

If you prefer a separated config subdomain:

- Display: `https://seats.atridayo.com/`
- Config: `https://seats-config.atridayo.com/`

The example reverse proxy redirects `seats-config.atridayo.com/` to `/config` on the same frontend app.

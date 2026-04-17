# VPS Deployment

This project is ready for a single VPS deployment with Docker Compose.

Recommended production flow: pull the published Docker images and run them with Docker Compose. This avoids slow or memory-heavy `npm install` and Docker builds on small VPS instances.

## 1. Recommended: Deploy Prebuilt Docker Hub Images

The default production compose file uses these published images:

- `atridayo/seatsheet-backend:latest`
- `atridayo/seatsheet-frontend:latest`

### First VPS Install

Install Docker on the VPS, then run:

```bash
cd ~
git clone https://github.com/AtriDayo/SeatSheet.git
cd SeatSheet
cp deploy/.env.prod.example deploy/.env.prod
nano deploy/.env.prod
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml pull
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml up -d
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml exec backend npm run prisma:deploy
```

Edit `deploy/.env.prod` before the first `up`:

- `DOCKER_IMAGE_NAMESPACE`: keep `atridayo` unless you publish your own image fork.
- `SEATSHEET_IMAGE_TAG`: use `latest` unless you want a specific commit SHA tag.
- `FRONTEND_PORT`: defaults to `8080`.
- `POSTGRES_PASSWORD`: choose a strong password before the database volume is initialized.
- `CORS_ORIGIN`: keep it aligned with your production domains.

### Switch From The Old Local-Build Deployment

If the old local-build compose file is already running, stop it first:

```bash
cd ~/SeatSheet
docker compose -f deploy/docker-compose.yml down
```

Do not add `-v` unless you intentionally want to delete the PostgreSQL volume and all seat data.

Then start the prebuilt-image deployment:

```bash
git pull
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml pull
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml up -d
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml exec backend npm run prisma:deploy
```

### Later Updates

After a new release image is published, run:

```bash
cd ~/SeatSheet
git pull
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml pull
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml up -d
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml exec backend npm run prisma:deploy
```

### Useful Checks

```bash
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml ps
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml logs -f backend frontend
curl -I http://127.0.0.1:8080/
```

## 2. DNS

In Cloudflare, create DNS-only records:

| Type | Name | Target |
| --- | --- | --- |
| A | `seats` | Your VPS IPv4 |
| A | `seats-config` | Your VPS IPv4 |

Keep the proxy status as DNS only if you want Cloudflare to only resolve the domain name.

## 3. Reverse Proxy

The app container listens on `127.0.0.1:8080` from the VPS perspective.

Use either:

- `deploy/nginx-vps.example.conf`
- `deploy/caddy.example`

For HTTPS, install a certificate with Certbot if using Nginx, or let Caddy issue certificates automatically.

If your VPS provider blocks unregistered domains or common web ports, DNS-only records cannot remove the need for a port. Without usable `80` or `443`, access URLs must include the port, such as `http://seats.atridayo.com:8080/`. To use `https://seats.atridayo.com/` without a port on a mainland China VPS, you usually need ICP filing for the domain, a provider-approved web port, or a different network path such as an overseas VPS or Cloudflare Tunnel/proxy.

## 4. URL Plan

The simplest production layout is:

- Display: `https://seats.atridayo.com/`
- Config: `https://seats.atridayo.com/config`

If `80` and `443` are unavailable, use:

- Display: `http://seats.atridayo.com:8080/`
- Config: `http://seats.atridayo.com:8080/config`

If you prefer a separated config subdomain:

- Display: `https://seats.atridayo.com/`
- Config: `https://seats-config.atridayo.com/`

The example reverse proxy redirects `seats-config.atridayo.com/` to `/config` on the same frontend app.

## 5. Fallback: Build On The VPS

Use this only when you cannot use Docker Hub images. It runs `npm install` and builds images on the VPS.

For mainland China VPS builds, configure Docker image mirrors first:

```bash
sudo mkdir -p /etc/docker
sudo cp deploy/docker-daemon-cn.example.json /etc/docker/daemon.json
sudo systemctl daemon-reload
sudo systemctl restart docker
```

Start services from source:

```bash
docker compose -f deploy/docker-compose.yml up -d --build
docker compose -f deploy/docker-compose.yml exec backend npm run prisma:deploy
```

Optional seed:

```bash
npm install --registry=https://registry.npmmirror.com
DATABASE_URL="postgresql://seatsheet:seatsheet_change_me@YOUR_VPS_IP:5432/seatsheet?schema=public" npm run prisma:seed --workspace backend
```

## 6. Maintainer: Publish Images

This section is only for maintainers who publish the official images.

Create these Docker Hub repositories:

- `seatsheet-backend`
- `seatsheet-frontend`

Create a Docker Hub access token, then add these GitHub repository secrets:

- `DOCKERHUB_USERNAME`: the Docker Hub username or organization.
- `DOCKERHUB_TOKEN`: a Docker Hub access token with permission to push images.

GitHub Actions builds and pushes the images when code is pushed to `main`.

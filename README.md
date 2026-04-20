# SeatSheet

SeatSheet is a minimal seat chart display and management app.

- Frontend: Vue 3, TypeScript, Tailwind CSS
- Backend: Fastify, Prisma
- Database: PostgreSQL
- Recommended deployment: pull prebuilt Docker images and run them with Docker Compose.

## Recommended Deployment

Use this path for VPS deployment. It avoids running `npm install` and image builds on a small VPS.

### 1. Install On The VPS

Install Docker, then pull and run the published images:

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

Edit `deploy/.env.prod` before the first `up`. Keep `DOCKER_IMAGE_NAMESPACE=atridayo` unless you publish your own image fork. Set `POSTGRES_PASSWORD` before the first database start and keep it stable afterward. Set `ADMIN_PASSWORD` to the password required for `/config`.

The app listens on `127.0.0.1:8080` from the VPS perspective. Put Caddy or Nginx in front of it for HTTPS:

```caddyfile
seats.atridayo.com {
  reverse_proxy 127.0.0.1:8080
}
```

### 2. Update Later

After a new release image is published, run on the VPS:

```bash
cd ~/SeatSheet
git pull
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml pull
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml up -d
docker compose --env-file deploy/.env.prod -f deploy/docker-compose.prod.yml exec backend npm run prisma:deploy
```

If you previously used the local-build compose file, stop it once before switching:

```bash
docker compose -f deploy/docker-compose.yml down
```

Do not add `-v` unless you intentionally want to delete the database.

### 3. Published Images

The default production compose file uses:

- `atridayo/seatsheet-backend:latest`
- `atridayo/seatsheet-frontend:latest`

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy environment files:

   ```bash
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   ```

3. Start PostgreSQL locally or use Docker:

   ```bash
   docker compose -f deploy/docker-compose.yml up -d postgres
   ```

4. Run Prisma migrations:

   ```bash
   npm run prisma:migrate --workspace backend
   ```

5. Start backend and frontend in two terminals:

   ```bash
   npm run dev:backend
   npm run dev:frontend
   ```

The display page is available at `http://localhost:5173/`.
The configuration page is available at `http://localhost:5173/config`.

## Production URLs

Recommended first version:

- Display: `https://seats.atridayo.com/`
- Config: `https://seats.atridayo.com/config`

You can later split config to `https://seats-config.atridayo.com/` by adding another Nginx server block that points to the same frontend build and rewrites to `/config`.

## Deployment

See [deploy/README.md](deploy/README.md).

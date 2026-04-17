# SeatSheet

SeatSheet is a minimal seat chart display and management app.

- Frontend: Vue 3, TypeScript, Tailwind CSS
- Backend: Fastify, Prisma
- Database: PostgreSQL
- Deployment target: VPS with Docker Compose and Cloudflare DNS-only records

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

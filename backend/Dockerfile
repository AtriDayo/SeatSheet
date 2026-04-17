FROM node:22-bookworm AS deps
WORKDIR /app
ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com
ENV PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
COPY backend/package.json package.json
RUN npm install

FROM deps AS build
WORKDIR /app
COPY backend .
RUN npm run prisma:generate
RUN npm run build

FROM node:22-bookworm AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NPM_CONFIG_REGISTRY=https://registry.npmmirror.com
ENV PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma
COPY backend/package.json package.json
RUN npm install --omit=dev
COPY --from=build /app/dist dist
COPY --from=build /app/prisma prisma
COPY --from=build /app/node_modules/.prisma node_modules/.prisma
EXPOSE 3000
CMD ["npm", "run", "start"]

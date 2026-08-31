FROM node:20-bookworm-slim

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY client/package.json client/pnpm-lock.yaml client/pnpm-workspace.yaml ./client/

RUN corepack enable \
  && corepack prepare pnpm@11.19.0 --activate \
  && pnpm install --frozen-lockfile \
  && pnpm --dir client install --frozen-lockfile

COPY . .

RUN pnpm run build:server

ENV NODE_ENV=production
EXPOSE 2567

CMD ["node", "server/lib/server/index.js"]

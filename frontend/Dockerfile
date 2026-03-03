# Stage 1: Build
FROM node:22-alpine AS builder
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# Stage 2: Serve (nginx config is overridden by docker-compose volume mount)
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html

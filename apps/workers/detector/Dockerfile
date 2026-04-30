FROM node:20-alpine AS builder
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter worker-detector build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/workers/detector/dist ./dist
COPY --from=builder /app/apps/workers/detector/package.json ./package.json
CMD ["node", "dist/index.js"]

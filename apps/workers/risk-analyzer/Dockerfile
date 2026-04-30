FROM node:20-alpine AS builder
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter worker-risk-analyzer build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/workers/risk-analyzer/dist ./dist
COPY --from=builder /app/apps/workers/risk-analyzer/package.json ./package.json
CMD ["node", "dist/index.js"]

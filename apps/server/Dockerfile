# 言智后端服务 Dockerfile
# 支持容器化部署 apps/server（Express API + Playwright 浏览器自动化）

FROM node:22-bookworm-slim AS base

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app

# 安装系统依赖（Playwright Chromium 需要）
RUN apt-get update && apt-get install -y --no-install-recommends \
    libnss3 libnspr4 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 \
    libgbm1 libxss1 libasound2 libgtk-3-0 \
    fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/*

# ---- 构建阶段 ----
FROM base AS builder

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json tsconfig.base.json ./
COPY apps/server ./apps/server
COPY packages ./packages
COPY apps/desktop ./apps/desktop

RUN pnpm install --frozen-lockfile

# 构建 server（tsc + fix-esm-extensions）
RUN pnpm --filter @yan-zhi/server build

# ---- 运行阶段 ----
FROM base AS runner

ENV NODE_ENV=production
ENV YZ_HOST=0.0.0.0
ENV YZ_PORT=3001

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=builder /app/apps/server/dist ./apps/server/dist
COPY --from=builder /app/apps/server/package.json ./apps/server/package.json
COPY --from=builder /app/packages ./packages

# 数据目录（data.db 持久化）
VOLUME ["/app/data"]

WORKDIR /app/apps/server

EXPOSE 3001

CMD ["node", "dist/apps/server/src/index.js"]
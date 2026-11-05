# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim

ENV CI=1
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1

RUN corepack enable
WORKDIR /work
COPY . .
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    --mount=type=cache,target=/root/.cache/node/corepack \
    pnpm install --frozen-lockfile --ignore-scripts --filter @yan-zhi/desktop --prod \
  && pnpm install --frozen-lockfile --ignore-scripts \
    --filter @yan-zhi/server... \
    --filter @yan-zhi/web...

CMD ["bash"]

# UpUp — 顶级投资助手 Claude Code 容器化部署
# Multi-stage build for minimal production image.

# ---- Stage 1: deps + build ----
FROM oven/bun:1.1.30-alpine AS builder
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
RUN bun run build:compile

# ---- Stage 2: runtime ----
FROM oven/bun:1.1.30-alpine AS runtime
WORKDIR /app
COPY --from=builder /app/dist/upup ./upup
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/src/skills ./src/skills
COPY --from=builder /app/.upup.templates ./.upup.templates
ENV NODE_ENV=production
ENV UPUP_BRIDGE_HOST=0.0.0.0
ENV UPUP_BRIDGE_PORT=8787
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD bun --version || exit 1
ENTRYPOINT ["./upup"]
CMD ["--help"]

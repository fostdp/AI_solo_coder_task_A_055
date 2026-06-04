FROM node:18-alpine AS builder

LABEL maintainer="Water Monitor Team"
LABEL description="城市供水管网漏损监测系统"

WORKDIR /app

COPY package.json package-lock.json* ./

RUN npm install --production && \
    npm cache clean --force

FROM node:18-alpine AS runtime

RUN apk add --no-cache wget tzdata && \
    cp /usr/share/zoneinfo/Asia/Shanghai /etc/localtime && \
    echo "Asia/Shanghai" > /etc/timezone && \
    apk del tzdata

RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY . .

RUN chown -R appuser:appgroup /app

USER appuser

ENV NODE_ENV=production
ENV USE_DB=true
ENV DB_HOST=postgres
ENV DB_PORT=5432
ENV DB_NAME=water_monitor
ENV DB_USER=postgres
ENV DB_PASSWORD=postgres
ENV DB_POOL_MAX=20
ENV HTTP_PORT=3000
ENV SIMULATE_DATA=true
ENV SIMULATOR_CONFIG=simulator-config.json

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/stats || exit 1

CMD ["node", "server/index.js"]

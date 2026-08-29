FROM node:24-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000

COPY package*.json ./
RUN npm ci --include=dev

COPY . .
RUN npm run build

RUN mkdir -p /app/data && chown node:node /app/data
USER node

EXPOSE 3000

CMD ["sh", "-c", "npm run db:seed && exec npm start -- -H 0.0.0.0 -p 3000"]

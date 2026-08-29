FROM node:22.18-alpine AS build
WORKDIR /app
COPY apps/v3-api/package.json apps/v3-api/package-lock.json ./
RUN npm ci
COPY apps/v3-api/tsconfig.json ./
COPY apps/v3-api/src ./src
COPY apps/v3-api/scripts ./scripts
COPY apps/v3-api/seed ./seed
RUN npm run build

FROM node:22.18-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
RUN apk add --no-cache ffmpeg libjpeg-turbo-utils optipng
RUN addgroup -S tongji && adduser -S -G tongji tongji
RUN mkdir -p /data/media && chown -R tongji:tongji /data
COPY apps/v3-api/package.json apps/v3-api/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/seed ./dist/seed
COPY apps/v3-api/supabase/migrations ./migrations
USER tongji
EXPOSE 4310
CMD ["node", "dist/src/server.js"]

FROM node:22.18-alpine AS build
WORKDIR /app
COPY apps/v3-local/package.json apps/v3-local/package-lock.json ./
RUN npm ci
COPY apps/v3-local/ ./
ARG VITE_APP_MODE=production
ARG VITE_API_BASE_URL=
ENV VITE_APP_MODE=${VITE_APP_MODE}
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npm run build

FROM nginx:1.29.1-alpine
COPY apps/v3-local/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080

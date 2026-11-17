# Frontend — build Vite + Nginx com proxy para o backend
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# VITE_API_URL vazio => mesma origem, com proxy do Nginx abaixo.
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build-only

FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80

FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3100 BRICKFORGE_DB=/app/data/brickforge.sqlite
COPY package*.json ./
RUN npm ci --omit=dev && mkdir /app/data && chown node:node /app/data
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
USER node
VOLUME /app/data
EXPOSE 3100
CMD ["node","dist-server/http.mjs"]

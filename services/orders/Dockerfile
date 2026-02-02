FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./

FROM base AS development
RUN npm install
COPY --chown=node:node . .
CMD ["npm","run","dev"]

FROM base AS build
RUN npm install --only=production

FROM node:20-alpine AS production
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=build /app/node_modules ./node_modules
COPY --chown=node:node . .
RUN chown -R appuser:appgroup /app

RUN apk add --no-cache wget

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --retries=3 --start-period=40s \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1
CMD ["node","app.js"]

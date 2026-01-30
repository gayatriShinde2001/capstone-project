FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./

FROM base as development
RUN npm install
COPY --chown=node:node . .
CMD ["npm","run","dev"]

FROM base as build
RUN npm install --only=production

FROM node:20-alpine AS production
WORKDIR /app
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
COPY --from=builder /app/node_modules ./node_modules
COPY --chown=node:node . .
RUN chown -R appuser:appgroup /app
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s \
  CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node","app.js"]

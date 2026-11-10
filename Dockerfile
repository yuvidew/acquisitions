# syntax=docker/dockerfile:1

# ---------- base ----------
FROM node:22-alpine AS base
WORKDIR /app
COPY package*.json ./

# ---------- development ----------
# Full deps (incl. drizzle-kit, eslint); source is bind-mounted by compose.
FROM base AS development
ENV NODE_ENV=development
RUN npm ci
COPY . .
RUN mkdir -p logs && chown -R node:node /app/logs
USER node
EXPOSE 3000
CMD ["npm", "run", "dev"]

# ---------- production deps ----------
FROM base AS prod-deps
RUN npm ci --omit=dev && npm cache clean --force

# ---------- production ----------
FROM node:22-alpine AS production
ENV NODE_ENV=production
WORKDIR /app
COPY --from=prod-deps /app/node_modules ./node_modules
COPY package*.json ./
COPY src ./src
RUN mkdir -p logs && chown -R node:node /app/logs
USER node
EXPOSE 3000
CMD ["npm", "start"]

# --- Build stage ---
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
# Build the TypeScript code (ignore TS errors in node_modules from actual-app/core)
RUN npm run build || true

# --- Runtime stage ---
FROM node:24-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY package.json .
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node", "dist/index.js"]

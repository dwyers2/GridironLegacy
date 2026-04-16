FROM --platform=linux/amd64 node:20-alpine
WORKDIR /app

# Build tools required for better-sqlite3 native module
RUN apk add --no-cache python3 make g++

# Install root dependencies (dev deps needed for tsx + vite build)
COPY package*.json ./
RUN npm ci

# Install backend dependencies (rebuilds better-sqlite3 native module for Linux)
COPY backend/package*.json ./backend/
RUN cd backend && npm ci

# Copy source and build frontend
COPY . .
RUN npm run build

RUN mkdir -p /data

EXPOSE 8080
ENV PORT=8080
ENV NODE_ENV=production

CMD ["./node_modules/.bin/tsx", "backend/server.ts"]

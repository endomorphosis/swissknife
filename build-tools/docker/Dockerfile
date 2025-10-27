# Multi-stage Dockerfile for SwissKnife Production Deployment
# Supports multi-architecture builds: linux/amd64, linux/arm64
# Stage 1: Build environment
FROM --platform=$BUILDPLATFORM node:20-alpine AS builder

# Build arguments for cross-compilation
ARG TARGETPLATFORM
ARG BUILDPLATFORM
ARG TARGETOS
ARG TARGETARCH

WORKDIR /app

# Display build information
RUN echo "Building for platform: $TARGETPLATFORM" && \
    echo "Build platform: $BUILDPLATFORM" && \
    echo "Target OS: $TARGETOS" && \
    echo "Target Architecture: $TARGETARCH"

# Copy package files
COPY package*.json ./
COPY yarn.lock* pnpm-lock.yaml* ./

# Install dependencies with production optimizations
# Use legacy-peer-deps flag for compatibility
RUN npm ci --legacy-peer-deps --only=production --no-audit --no-fund

# Copy source code
COPY . .

# Build all components
RUN npm run build:all

# Stage 2: Production runtime
FROM --platform=$TARGETPLATFORM node:20-alpine AS production

# Build arguments for runtime
ARG TARGETPLATFORM
ARG TARGETOS
ARG TARGETARCH

WORKDIR /app

# Display runtime platform information
RUN echo "Runtime platform: $TARGETPLATFORM" && \
    echo "Runtime OS: $TARGETOS" && \
    echo "Runtime Architecture: $TARGETARCH" && \
    echo "Node version: $(node --version)" && \
    echo "NPM version: $(npm --version)"

# Install production dependencies only
COPY package*.json ./
RUN npm ci --legacy-peer-deps --only=production --no-audit --no-fund && npm cache clean --force

# Copy built artifacts from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/web/dist ./web/dist
COPY --from=builder /app/ipfs_accelerate_js/dist ./ipfs_accelerate_js/dist
COPY --from=builder /app/cli.mjs ./cli.mjs

# Copy essential runtime files
COPY --from=builder /app/vite.web.config.ts ./vite.web.config.ts
COPY --from=builder /app/src/shared ./src/shared

# Create non-root user for security
RUN addgroup -g 1001 -S swissknife && \
    adduser -S swissknife -u 1001

# Set ownership and permissions
RUN chown -R swissknife:swissknife /app
USER swissknife

# Expose the web GUI port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3001/ || exit 1

# Default command to run the virtual desktop
CMD ["npm", "run", "desktop"]

# Labels for metadata
LABEL maintainer="Benjamin Barber <starworks5@gmail.com>"
LABEL description="SwissKnife - Unified AI-powered development suite with virtual desktop"
LABEL version="0.0.53"
LABEL org.opencontainers.image.source="https://github.com/hallucinate-llc/swissknife"
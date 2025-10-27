#!/usr/bin/env bash
# Build script for SwissKnife - automatically detects and builds for current platform

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Detect platform and architecture
OS=$(uname -s | tr '[:upper:]' '[:lower:]')
ARCH=$(uname -m)

# Normalize architecture names
case "$ARCH" in
    x86_64|amd64)
        ARCH="x86_64"
        ARCH_DISPLAY="x86_64 (AMD64)"
        ;;
    aarch64|arm64)
        ARCH="arm64"
        ARCH_DISPLAY="ARM64"
        ;;
    armv7l|armv7)
        ARCH="arm"
        ARCH_DISPLAY="ARM32"
        ;;
    *)
        ARCH_DISPLAY="$ARCH (unknown)"
        ;;
esac

# Normalize OS names
case "$OS" in
    linux)
        OS_DISPLAY="Linux"
        ;;
    darwin)
        OS_DISPLAY="macOS"
        ;;
    mingw*|msys*|cygwin*)
        OS_DISPLAY="Windows"
        ;;
    *)
        OS_DISPLAY="$OS"
        ;;
esac

echo -e "${BLUE}╔════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║     SwissKnife Multi-Architecture Builder     ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}Platform Information:${NC}"
echo -e "  OS:           $OS_DISPLAY"
echo -e "  Architecture: $ARCH_DISPLAY"
echo -e "  Node.js:      $(node --version)"
echo -e "  npm:          $(npm --version)"
echo ""

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo -e "${RED}❌ Error: Node.js 18 or higher is required${NC}"
    echo -e "${YELLOW}   Current version: $(node --version)${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Node.js version check passed${NC}"
echo ""

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}📦 Installing dependencies...${NC}"
    npm install --legacy-peer-deps
    echo ""
fi

# Build based on target
BUILD_TARGET=${1:-all}

case "$BUILD_TARGET" in
    all)
        echo -e "${BLUE}🔨 Building all components...${NC}"
        npm run build:all
        ;;
    cli)
        echo -e "${BLUE}🔨 Building CLI only...${NC}"
        npm run build:cli
        ;;
    web)
        echo -e "${BLUE}🔨 Building Web GUI only...${NC}"
        npm run build:web
        ;;
    ipfs)
        echo -e "${BLUE}🔨 Building IPFS accelerate only...${NC}"
        npm run build:ipfs
        ;;
    docker)
        echo -e "${BLUE}🐳 Building Docker image for current platform...${NC}"
        docker build -f build-tools/docker/Dockerfile -t swissknife:$ARCH .
        ;;
    docker-multi)
        echo -e "${BLUE}🐳 Building multi-architecture Docker images...${NC}"
        
        # Check if buildx is available
        if ! docker buildx version &> /dev/null; then
            echo -e "${RED}❌ Error: Docker Buildx is required for multi-arch builds${NC}"
            echo -e "${YELLOW}   Install Docker Desktop or configure Buildx${NC}"
            exit 1
        fi
        
        # Create builder if it doesn't exist
        if ! docker buildx inspect multiarch &> /dev/null; then
            echo -e "${YELLOW}📦 Creating multiarch builder...${NC}"
            docker buildx create --name multiarch --use
            docker buildx inspect --bootstrap
        fi
        
        docker buildx build \
            --platform linux/amd64,linux/arm64 \
            -f build-tools/docker/Dockerfile \
            -t swissknife:latest \
            --load \
            .
        ;;
    test)
        echo -e "${BLUE}🧪 Running tests...${NC}"
        npm run test:working
        ;;
    clean)
        echo -e "${YELLOW}🧹 Cleaning build artifacts...${NC}"
        rm -rf dist/ web/dist/ ipfs_accelerate_js/dist/ cli.mjs
        echo -e "${GREEN}✅ Clean complete${NC}"
        exit 0
        ;;
    help|--help|-h)
        echo -e "${BLUE}Usage: $0 [target]${NC}"
        echo ""
        echo "Targets:"
        echo "  all           Build all components (default)"
        echo "  cli           Build CLI only"
        echo "  web           Build Web GUI only"
        echo "  ipfs          Build IPFS accelerate only"
        echo "  docker        Build Docker image for current platform"
        echo "  docker-multi  Build multi-architecture Docker images"
        echo "  test          Run tests"
        echo "  clean         Clean build artifacts"
        echo "  help          Show this help message"
        echo ""
        echo "Examples:"
        echo "  $0              # Build all components"
        echo "  $0 cli          # Build CLI only"
        echo "  $0 docker-multi # Build Docker images for x86_64 and ARM64"
        exit 0
        ;;
    *)
        echo -e "${RED}❌ Unknown target: $BUILD_TARGET${NC}"
        echo -e "${YELLOW}   Run '$0 help' for usage information${NC}"
        exit 1
        ;;
esac

# Verify build artifacts
echo ""
echo -e "${BLUE}📋 Verifying build artifacts...${NC}"

if [ "$BUILD_TARGET" != "docker" ] && [ "$BUILD_TARGET" != "docker-multi" ] && [ "$BUILD_TARGET" != "test" ]; then
    if [ -f "cli.mjs" ]; then
        CLI_SIZE=$(stat -c%s "cli.mjs" 2>/dev/null || stat -f%z "cli.mjs" 2>/dev/null)
        echo -e "${GREEN}✅ cli.mjs${NC} (${CLI_SIZE} bytes)"
    else
        echo -e "${YELLOW}⚠️  cli.mjs not found${NC}"
    fi
    
    if [ -d "dist" ]; then
        DIST_FILES=$(find dist -type f -name "*.js" 2>/dev/null | wc -l | tr -d ' ')
        echo -e "${GREEN}✅ dist/${NC} ($DIST_FILES files)"
    else
        echo -e "${YELLOW}⚠️  dist/ directory not found${NC}"
    fi
    
    if [ -d "web/dist" ]; then
        WEB_FILES=$(find web/dist -type f 2>/dev/null | wc -l | tr -d ' ')
        echo -e "${GREEN}✅ web/dist/${NC} ($WEB_FILES files)"
    else
        echo -e "${YELLOW}⚠️  web/dist/ directory not found${NC}"
    fi
fi

echo ""
echo -e "${GREEN}╔════════════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║          ✅ Build completed successfully       ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${BLUE}Next steps:${NC}"

if [ "$BUILD_TARGET" = "docker" ] || [ "$BUILD_TARGET" = "docker-multi" ]; then
    echo -e "  • Run container:     ${YELLOW}docker run -p 3001:3001 swissknife:latest${NC}"
    echo -e "  • Run collaborative: ${YELLOW}docker run -p 3001:3001 swissknife:latest npm run desktop:collaborative${NC}"
else
    echo -e "  • Start desktop:     ${YELLOW}npm run desktop${NC}"
    echo -e "  • Start CLI:         ${YELLOW}./cli.mjs --help${NC}"
    echo -e "  • Run tests:         ${YELLOW}npm test${NC}"
fi

echo ""
echo -e "${BLUE}Platform: $OS_DISPLAY $ARCH_DISPLAY | Built with ❤️  by SwissKnife${NC}"

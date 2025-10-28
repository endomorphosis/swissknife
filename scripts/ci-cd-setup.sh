#!/bin/bash

# Complete SwissKnife CI/CD Setup Script
# Sets up GitHub Actions runners and Docker environment

set -e

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
REPO_OWNER="endomorphosis"
REPO_NAME="swissknife"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
echo_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
echo_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
echo_error() { echo -e "${RED}[ERROR]${NC} $1"; }

show_help() {
    cat << EOF
SwissKnife CI/CD Setup Script

Usage: $0 [OPTION]

Options:
  setup-runner     Set up GitHub Actions self-hosted runner
  setup-docker     Set up Docker environment for CI/CD
  test-build       Test Docker build process
  test-ci          Test CI/CD pipeline
  start-services   Start all services
  stop-services    Stop all services
  status           Show status of all services
  logs             Show logs from services
  clean            Clean up Docker resources
  help             Show this help message

Environment Variables:
  GITHUB_TOKEN     GitHub personal access token (required for runner setup)

Examples:
  $0 setup-runner    # Set up GitHub Actions runner
  $0 test-build      # Test Docker build
  $0 start-services  # Start all Docker services
  $0 status          # Check service status

EOF
}

check_prerequisites() {
    echo_info "Checking prerequisites..."
    
    local missing=()
    
    # Check required commands
    for cmd in docker git curl jq npm; do
        if ! command -v "$cmd" &> /dev/null; then
            missing+=("$cmd")
        fi
    done
    
    if [ ${#missing[@]} -ne 0 ]; then
        echo_error "Missing required commands: ${missing[*]}"
        return 1
    fi
    
    # Check Docker is running
    if ! docker info &> /dev/null; then
        echo_error "Docker is not running or not accessible"
        return 1
    fi
    
    # Check if we're in the right directory
    if [ ! -f "$PROJECT_ROOT/package.json" ]; then
        echo_error "Not in SwissKnife project directory"
        return 1
    fi
    
    echo_success "All prerequisites met"
}

setup_runner() {
    echo_info "Setting up GitHub Actions self-hosted runner..."
    
    if [ -z "$GITHUB_TOKEN" ]; then
        echo_error "GITHUB_TOKEN environment variable is required"
        echo_info "Please set: export GITHUB_TOKEN=\"github_pat_xxxxxxxxxxxxx\""
        return 1
    fi
    
    # Run the runner setup script
    if [ -f "$SCRIPT_DIR/setup-github-runner.sh" ]; then
        "$SCRIPT_DIR/setup-github-runner.sh"
    else
        echo_error "Runner setup script not found at $SCRIPT_DIR/setup-github-runner.sh"
        return 1
    fi
}

setup_docker() {
    echo_info "Setting up Docker environment..."
    
    cd "$PROJECT_ROOT"
    
    # Create necessary directories
    mkdir -p data logs runner-data runner-logs
    
    # Build Docker images
    echo_info "Building Docker images..."
    
    # Build main application image
    docker build -f build-tools/docker/Dockerfile -t swissknife:latest .
    
    # Build runner image
    docker build -f build-tools/docker/Dockerfile.runner -t swissknife-runner:latest .
    
    # Build development image
    docker build -f build-tools/docker/Dockerfile.dev -t swissknife:dev .
    
    echo_success "Docker images built successfully"
}

test_build() {
    echo_info "Testing build process..."
    
    cd "$PROJECT_ROOT"
    
    # Test npm build
    echo_info "Testing npm build..."
    if [ ! -d "node_modules" ]; then
        npm install --legacy-peer-deps
    fi
    npm run build:all
    
    # Test Docker build
    echo_info "Testing Docker build..."
    docker build -f build-tools/docker/Dockerfile -t swissknife:test .
    
    # Test Docker run
    echo_info "Testing Docker run..."
    docker run --rm -d --name swissknife-test -p 3001:3001 swissknife:test
    
    # Wait for startup
    sleep 10
    
    # Test health check
    if curl -f http://localhost:3001/ &> /dev/null; then
        echo_success "Docker container is running and responding"
    else
        echo_warning "Docker container may not be fully ready yet"
    fi
    
    # Cleanup
    docker stop swissknife-test || true
    
    echo_success "Build tests completed"
}

test_ci() {
    echo_info "Testing CI/CD pipeline..."
    
    # Check if runner is active
    if systemctl is-active --quiet actions-runner 2>/dev/null; then
        echo_success "GitHub Actions runner is active"
    else
        echo_warning "GitHub Actions runner is not active"
    fi
    
    # Create a test commit to trigger CI
    cd "$PROJECT_ROOT"
    
    # Check if there are any changes to commit
    if ! git diff --quiet || ! git diff --cached --quiet; then
        echo_info "Creating test commit to trigger CI..."
        git add .
        git commit -m "Test CI/CD pipeline with self-hosted runner" || true
        
        echo_info "Pushing to trigger GitHub Actions..."
        git push origin "$(git branch --show-current)" || echo_warning "Push failed or no remote configured"
        
        echo_info "Check GitHub Actions at:"
        echo "  https://github.com/$REPO_OWNER/$REPO_NAME/actions"
    else
        echo_info "No changes to commit. CI test skipped."
    fi
}

start_services() {
    echo_info "Starting Docker services..."
    
    cd "$PROJECT_ROOT"
    
    # Start with Docker Compose
    if [ -f "docker-compose.yml" ]; then
        docker-compose up -d
        echo_success "Docker services started"
        
        echo_info "Service status:"
        docker-compose ps
    else
        echo_warning "docker-compose.yml not found, starting manually..."
        
        # Start main application
        docker run -d --name swissknife-app \
            -p 3001:3001 \
            -v "$(pwd)/data:/app/data" \
            -v "$(pwd)/logs:/app/logs" \
            --restart unless-stopped \
            swissknife:latest
        
        echo_success "SwissKnife application started"
    fi
    
    # Start GitHub Actions runner service if not running
    if ! systemctl is-active --quiet actions-runner 2>/dev/null; then
        echo_info "Starting GitHub Actions runner service..."
        sudo systemctl start actions-runner || echo_warning "Could not start actions-runner service"
    fi
}

stop_services() {
    echo_info "Stopping Docker services..."
    
    cd "$PROJECT_ROOT"
    
    # Stop with Docker Compose
    if [ -f "docker-compose.yml" ]; then
        docker-compose down
    else
        # Stop manually started containers
        docker stop swissknife-app swissknife-runner || true
        docker rm swissknife-app swissknife-runner || true
    fi
    
    echo_success "Docker services stopped"
}

show_status() {
    echo_info "Service Status Report"
    echo "===================="
    
    # Docker status
    echo_info "Docker Services:"
    if command -v docker-compose &> /dev/null && [ -f "$PROJECT_ROOT/docker-compose.yml" ]; then
        cd "$PROJECT_ROOT"
        docker-compose ps
    else
        docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
    fi
    
    echo
    
    # GitHub Actions runner status
    echo_info "GitHub Actions Runner:"
    if systemctl is-active --quiet actions-runner 2>/dev/null; then
        echo_success "✅ Active"
        echo "Service: $(systemctl is-active actions-runner)"
        echo "Uptime: $(systemctl show actions-runner --property=ActiveEnterTimestamp --value)"
    else
        echo_warning "❌ Not active or not installed"
    fi
    
    echo
    
    # System resources
    echo_info "System Resources:"
    echo "Memory: $(free -h | grep '^Mem:' | awk '{print $3 "/" $2}')"
    echo "Disk: $(df -h . | tail -1 | awk '{print $3 "/" $2 " (" $5 " used)"}')"
    echo "Docker: $(docker system df --format 'table {{.Type}}\t{{.Size}}')"
}

show_logs() {
    echo_info "Recent Service Logs"
    echo "=================="
    
    # Docker logs
    echo_info "Docker Container Logs:"
    if docker ps --format '{{.Names}}' | grep -q swissknife; then
        for container in $(docker ps --format '{{.Names}}' | grep swissknife); do
            echo "--- $container ---"
            docker logs --tail 10 "$container"
            echo
        done
    else
        echo "No SwissKnife containers running"
    fi
    
    # GitHub Actions runner logs
    echo_info "GitHub Actions Runner Logs:"
    if systemctl is-active --quiet actions-runner 2>/dev/null; then
        sudo journalctl -u actions-runner --no-pager -n 10
    else
        echo "Actions runner service not active"
    fi
}

clean_docker() {
    echo_info "Cleaning up Docker resources..."
    
    # Stop all SwissKnife containers
    docker ps -a --format '{{.Names}}' | grep swissknife | xargs -r docker stop
    docker ps -a --format '{{.Names}}' | grep swissknife | xargs -r docker rm
    
    # Remove unused images
    docker image prune -f
    
    # Remove unused volumes
    docker volume prune -f
    
    # Remove unused networks
    docker network prune -f
    
    echo_success "Docker cleanup completed"
}

main() {
    case "${1:-help}" in
        setup-runner)
            check_prerequisites
            setup_runner
            ;;
        setup-docker)
            check_prerequisites
            setup_docker
            ;;
        test-build)
            check_prerequisites
            test_build
            ;;
        test-ci)
            check_prerequisites
            test_ci
            ;;
        start-services)
            check_prerequisites
            start_services
            ;;
        stop-services)
            stop_services
            ;;
        status)
            show_status
            ;;
        logs)
            show_logs
            ;;
        clean)
            clean_docker
            ;;
        help|--help|-h)
            show_help
            ;;
        *)
            echo_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
}

# Handle script interruption
cleanup() {
    echo_warning "Script interrupted. Cleaning up..."
    exit 1
}

trap cleanup INT TERM

# Run main function
main "$@"
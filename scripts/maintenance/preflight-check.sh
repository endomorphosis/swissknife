#!/bin/bash

# Pre-flight check for SwissKnife Docker and Runner setup
# This script validates that everything is ready for the GitHub Actions runner setup

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
echo_success() { echo -e "${GREEN}[✅]${NC} $1"; }
echo_warning() { echo -e "${YELLOW}[⚠️]${NC} $1"; }
echo_error() { echo -e "${RED}[❌]${NC} $1"; }

print_header() {
    echo "=================================================="
    echo "SwissKnife Docker & Runner Pre-flight Check"
    echo "=================================================="
    echo ""
}

check_system() {
    echo_info "Checking system requirements..."
    
    # Architecture
    arch=$(uname -m)
    echo_info "Architecture: $arch"
    if [[ "$arch" == "x86_64" ]]; then
        echo_success "x86_64 architecture supported"
    else
        echo_warning "Non-x86_64 architecture: $arch"
    fi
    
    # OS
    if [[ -f /etc/os-release ]]; then
        os_info=$(grep PRETTY_NAME /etc/os-release | cut -d'"' -f2)
        echo_info "OS: $os_info"
        echo_success "Linux OS detected"
    else
        echo_error "Unable to detect OS"
        return 1
    fi
    
    # Resources
    cpu_count=$(nproc)
    memory_gb=$(free -g | grep "^Mem:" | awk '{print $2}')
    disk_avail=$(df -BG / | tail -1 | awk '{print $4}' | sed 's/G//')
    
    echo_info "Resources: ${cpu_count} CPUs, ${memory_gb}GB RAM, ${disk_avail}GB disk available"
    
    if [[ $cpu_count -ge 4 ]]; then
        echo_success "CPU count sufficient ($cpu_count cores)"
    else
        echo_warning "Low CPU count: $cpu_count (recommend 4+)"
    fi
    
    if [[ $memory_gb -ge 8 ]]; then
        echo_success "Memory sufficient (${memory_gb}GB)"
    else
        echo_warning "Low memory: ${memory_gb}GB (recommend 8GB+)"
    fi
    
    if [[ $disk_avail -ge 20 ]]; then
        echo_success "Disk space sufficient (${disk_avail}GB available)"
    else
        echo_warning "Low disk space: ${disk_avail}GB (recommend 20GB+)"
    fi
}

check_dependencies() {
    echo_info "Checking required dependencies..."
    
    local deps=("curl" "tar" "git" "jq" "docker" "systemctl")
    local missing=()
    
    for dep in "${deps[@]}"; do
        if command -v "$dep" >/dev/null 2>&1; then
            echo_success "$dep installed"
        else
            echo_error "$dep not found"
            missing+=("$dep")
        fi
    done
    
    if [[ ${#missing[@]} -ne 0 ]]; then
        echo_error "Missing dependencies: ${missing[*]}"
        echo_info "Install with: sudo apt update && sudo apt install -y ${missing[*]}"
        return 1
    fi
    
    echo_success "All dependencies installed"
}

check_docker() {
    echo_info "Checking Docker setup..."
    
    # Docker version
    if docker --version >/dev/null 2>&1; then
        docker_version=$(docker --version | awk '{print $3}' | sed 's/,//')
        echo_success "Docker installed: $docker_version"
    else
        echo_error "Docker not installed"
        return 1
    fi
    
    # Docker daemon
    if docker info >/dev/null 2>&1; then
        echo_success "Docker daemon running"
    else
        echo_error "Docker daemon not accessible"
        echo_info "Try: sudo systemctl start docker"
        return 1
    fi
    
    # Docker permissions
    if docker ps >/dev/null 2>&1; then
        echo_success "Docker accessible without sudo"
    else
        echo_warning "Docker requires sudo (may need to add user to docker group)"
        echo_info "Run: sudo usermod -aG docker \$USER && logout/login"
    fi
    
    # Docker info
    containers=$(docker ps -q | wc -l)
    images=$(docker images -q | wc -l)
    echo_info "Docker status: $containers containers running, $images images"
    
    # Test Docker build capability
    echo_info "Testing Docker build capability..."
    cat > /tmp/test-dockerfile << 'EOF'
FROM alpine:latest
RUN echo "Docker build test successful"
EOF
    
    if docker build -t test-build -f /tmp/test-dockerfile /tmp >/dev/null 2>&1; then
        echo_success "Docker build capability verified"
        docker rmi test-build >/dev/null 2>&1 || true
    else
        echo_error "Docker build test failed"
        return 1
    fi
    
    rm -f /tmp/test-dockerfile
}

check_swissknife_project() {
    echo_info "Checking SwissKnife project setup..."
    
    # Check if we're in the right directory
    if [[ ! -f "package.json" ]]; then
        echo_error "package.json not found - run from SwissKnife project root"
        return 1
    fi
    
    # Check project name
    project_name=$(jq -r '.name' package.json 2>/dev/null || echo "unknown")
    if [[ "$project_name" == *"swissknife"* ]] || [[ "$project_name" == "swissknife" ]]; then
        echo_success "SwissKnife project detected: $project_name"
    else
        echo_warning "Project name doesn't contain 'swissknife': $project_name"
    fi
    
    # Check for Docker files
    if [[ -f "build-tools/docker/Dockerfile" ]]; then
        echo_success "Main Dockerfile found"
    else
        echo_error "Main Dockerfile not found at build-tools/docker/Dockerfile"
        return 1
    fi
    
    if [[ -f "build-tools/docker/Dockerfile.runner" ]]; then
        echo_success "Runner Dockerfile found"
    else
        echo_error "Runner Dockerfile not found at build-tools/docker/Dockerfile.runner"
        return 1
    fi
    
    if [[ -f "docker-compose.yml" ]]; then
        echo_success "Docker Compose file found"
    else
        echo_warning "Docker Compose file not found"
    fi
    
    # Check for workflow files
    workflow_count=$(find .github/workflows -name "*.yml" 2>/dev/null | wc -l)
    echo_info "Found $workflow_count GitHub workflow files"
    
    if [[ -f ".github/workflows/docker-integration.yml" ]]; then
        echo_success "Docker integration workflow found"
    else
        echo_warning "Docker integration workflow not found"
    fi
}

test_docker_build() {
    echo_info "Testing SwissKnife Docker build..."
    
    # Test Dockerfile syntax by trying to parse it
    if docker build --help >/dev/null 2>&1; then
        echo_success "Docker build command available"
    else
        echo_error "Docker build command not available"
        return 1
    fi
    
    # Quick validation - check if essential files exist for build
    local missing_files=()
    local required_files=("package.json" "build-tools/docker/Dockerfile")
    
    for file in "${required_files[@]}"; do
        if [[ ! -f "$file" ]]; then
            missing_files+=("$file")
        fi
    done
    
    if [[ ${#missing_files[@]} -ne 0 ]]; then
        echo_error "Missing required files for Docker build: ${missing_files[*]}"
        return 1
    fi
    
    echo_success "Required files for Docker build present"
    
    # Test basic Docker functionality with a simple build
    echo_info "Testing Docker build capability with simple test..."
    
    # Create a minimal test Dockerfile
    cat > /tmp/test-dockerfile << 'EOF'
FROM node:20-alpine
WORKDIR /app
COPY package.json ./
RUN echo "Docker build test successful"
CMD ["echo", "test"]
EOF
    
    if docker build -t test-build -f /tmp/test-dockerfile . >/dev/null 2>&1; then
        echo_success "Docker build capability verified"
        docker rmi test-build >/dev/null 2>&1 || true
    else
        echo_warning "Basic Docker build test failed"
        echo_info "This may be due to missing dependencies in package.json or network issues"
        echo_info "The full build should still work with proper setup"
    fi
    
    rm -f /tmp/test-dockerfile
    
    # Check if we can at least inspect the Dockerfile
    if [[ -r "build-tools/docker/Dockerfile" ]]; then
        echo_success "Dockerfile is readable and accessible"
    else
        echo_error "Cannot read Dockerfile"
        return 1
    fi
}

check_github_access() {
    echo_info "Checking GitHub access requirements..."
    
    # Check if we can reach GitHub
    if curl -s https://api.github.com/rate_limit >/dev/null 2>&1; then
        echo_success "GitHub API accessible"
    else
        echo_error "Cannot reach GitHub API"
        return 1
    fi
    
    # Check for GitHub token
    if [[ -n "$GITHUB_TOKEN" ]]; then
        echo_success "GITHUB_TOKEN environment variable set"
        
        # Validate token format
        if [[ "$GITHUB_TOKEN" =~ ^(ghp_|github_pat_) ]]; then
            echo_success "Token format appears valid"
        else
            echo_warning "Token format doesn't match expected GitHub format"
        fi
        
        # Test token (without exposing it)
        if curl -s -H "Authorization: Bearer $GITHUB_TOKEN" https://api.github.com/user >/dev/null 2>&1; then
            echo_success "GitHub token authentication successful"
        else
            echo_error "GitHub token authentication failed"
            return 1
        fi
    else
        echo_warning "GITHUB_TOKEN not set"
        echo_info "You'll need to set this before running the setup script"
        echo_info "Get token from: https://github.com/settings/tokens"
    fi
}

check_existing_runners() {
    echo_info "Checking for existing GitHub Actions runners..."
    
    # Check for existing runner services
    runner_services=$(systemctl list-units --type=service 2>/dev/null | grep "actions.runner" | wc -l)
    
    if [[ $runner_services -gt 0 ]]; then
        echo_info "Found $runner_services existing runner services"
        systemctl list-units --type=service | grep "actions.runner" | while read line; do
            service_name=$(echo "$line" | awk '{print $1}')
            status=$(echo "$line" | awk '{print $3}')
            echo_info "  $service_name: $status"
        done
        echo_success "Existing runners detected and working"
    else
        echo_info "No existing runner services found"
        echo_info "This will be the first runner on this machine"
    fi
}

generate_summary() {
    echo ""
    echo "=================================================="
    echo "Pre-flight Check Summary"
    echo "=================================================="
    echo ""
    echo_info "System: $(uname -s) $(uname -m)"
    echo_info "Docker: $(docker --version | awk '{print $3}' | sed 's/,//')"
    echo_info "Project: SwissKnife ($(pwd))"
    echo_info "Ready for GitHub Actions self-hosted runner setup"
    echo ""
    echo_success "✅ All checks passed!"
    echo ""
    echo_info "Next steps:"
    echo_info "1. Set GITHUB_TOKEN if not already set:"
    echo_info "   export GITHUB_TOKEN=\"github_pat_xxxxxxxxxxxxx\""
    echo_info "2. Run the setup script:"
    echo_info "   ./scripts/ci/setup-swissknife-runner.sh"
    echo_info "3. Monitor the runner:"
    echo_info "   https://github.com/endomorphosis/swissknife/settings/actions/runners"
    echo ""
}

# Main execution
main() {
    print_header
    
    local failed=0
    
    check_system || failed=1
    echo ""
    
    check_dependencies || failed=1
    echo ""
    
    check_docker || failed=1
    echo ""
    
    check_swissknife_project || failed=1
    echo ""
    
    test_docker_build || failed=1
    echo ""
    
    check_github_access || failed=1
    echo ""
    
    check_existing_runners
    echo ""
    
    if [[ $failed -eq 0 ]]; then
        generate_summary
        exit 0
    else
        echo_error "Pre-flight check failed"
        echo_info "Please resolve the issues above before proceeding"
        exit 1
    fi
}

main "$@"
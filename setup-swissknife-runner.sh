#!/bin/bash

# SwissKnife GitHub Actions Self-Hosted Runner Setup
# This script sets up a dedicated runner for the endomorphosis/swissknife repository

set -e

# Configuration
REPO_OWNER="endomorphosis"
REPO_NAME="swissknife" 
RUNNER_NAME="swissknife-workstation-$(date +%Y%m%d-%H%M%S)"
RUNNER_LABELS="self-hosted,linux,x64,docker,swissknife,workstation"
ACTIONS_RUNNER_DIR="/opt/actions-runner-swissknife"
SERVICE_NAME="actions.runner.${REPO_OWNER}-${REPO_NAME}.${RUNNER_NAME}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

echo_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

echo_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

echo_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

print_banner() {
    echo_info "=========================================="
    echo_info "SwissKnife GitHub Actions Runner Setup"
    echo_info "Repository: $REPO_OWNER/$REPO_NAME"
    echo_info "Runner: $RUNNER_NAME"
    echo_info "Labels: $RUNNER_LABELS"
    echo_info "=========================================="
}

# Check if running as correct user
check_user() {
    if [[ $EUID -eq 0 ]]; then
        echo_error "This script should not be run as root"
        echo_info "Please run as user 'devel' or another non-root user with sudo privileges"
        exit 1
    fi
    
    echo_info "Running as user: $(whoami)"
}

# Check dependencies
check_dependencies() {
    echo_info "Checking system dependencies..."
    
    local deps=("curl" "tar" "docker" "git" "jq" "systemctl")
    local missing_deps=()
    
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            missing_deps+=("$dep")
        fi
    done
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        echo_error "Missing dependencies: ${missing_deps[*]}"
        echo_info "Install with: sudo apt update && sudo apt install -y ${missing_deps[*]}"
        exit 1
    fi
    
    # Check Docker access
    if ! docker info >/dev/null 2>&1; then
        echo_error "Docker not accessible. Please ensure:"
        echo_info "1. Docker is installed and running"
        echo_info "2. Your user is in the docker group: sudo usermod -aG docker \$USER"
        echo_info "3. You've logged out and back in after adding to docker group"
        exit 1
    fi
    
    echo_success "All dependencies satisfied"
}

# Check GitHub token
check_github_token() {
    echo_info "Checking GitHub token..."
    
    if [ -z "$GITHUB_TOKEN" ]; then
        echo_error "GITHUB_TOKEN environment variable is required"
        echo_info ""
        echo_info "To obtain a GitHub Personal Access Token:"
        echo_info "1. Go to: https://github.com/settings/tokens"
        echo_info "2. Click 'Generate new token (classic)'"
        echo_info "3. Give it a descriptive name like 'SwissKnife Self-Hosted Runner'"
        echo_info "4. Select the 'repo' scope (full control of private repositories)"
        echo_info "5. Click 'Generate token'"
        echo_info "6. Copy the token and set it: export GITHUB_TOKEN=github_pat_xxxxx"
        echo_info ""
        echo_warning "The token must have 'repo' scope to register runners"
        exit 1
    fi
    
    # Validate token format
    if [[ ! "$GITHUB_TOKEN" =~ ^(ghp_|github_pat_) ]]; then
        echo_warning "Token doesn't match expected GitHub format"
        echo_info "GitHub tokens typically start with 'ghp_' or 'github_pat_'"
    fi
    
    echo_success "GitHub token is set"
}

# Create runner directory and user
setup_runner_environment() {
    echo_info "Setting up runner environment..."
    
    # Create dedicated runner directory
    sudo mkdir -p "$ACTIONS_RUNNER_DIR"
    
    # Create actions user if it doesn't exist
    if ! id "actions" &>/dev/null; then
        echo_info "Creating 'actions' user..."
        sudo useradd -m -s /bin/bash actions
        sudo usermod -aG docker actions
        echo_success "Created 'actions' user and added to docker group"
    else
        echo_info "User 'actions' already exists"
        # Ensure it's in docker group
        sudo usermod -aG docker actions
    fi
    
    # Set ownership
    sudo chown -R actions:actions "$ACTIONS_RUNNER_DIR"
    
    echo_success "Runner environment prepared"
}

# Download and install GitHub Actions runner
install_runner() {
    echo_info "Installing GitHub Actions runner..."
    
    # Get latest runner version
    local latest_version=$(curl -s https://api.github.com/repos/actions/runner/releases/latest | jq -r '.tag_name' | sed 's/^v//')
    echo_info "Latest runner version: $latest_version"
    
    # Download runner
    local runner_file="actions-runner-linux-x64-${latest_version}.tar.gz"
    local download_url="https://github.com/actions/runner/releases/download/v${latest_version}/${runner_file}"
    
    echo_info "Downloading: $download_url"
    
    cd /tmp
    curl -o "$runner_file" -L "$download_url"
    
    # Verify download
    if [ ! -f "$runner_file" ]; then
        echo_error "Failed to download runner"
        exit 1
    fi
    
    # Extract to runner directory
    sudo tar xzf "$runner_file" -C "$ACTIONS_RUNNER_DIR"
    sudo chown -R actions:actions "$ACTIONS_RUNNER_DIR"
    
    # Install dependencies
    sudo "$ACTIONS_RUNNER_DIR/bin/installdependencies.sh"
    
    # Cleanup
    rm -f "$runner_file"
    
    echo_success "Runner installed to $ACTIONS_RUNNER_DIR"
}

# Configure the runner
configure_runner() {
    echo_info "Configuring runner with GitHub..."
    
    # Get registration token
    echo_info "Obtaining registration token..."
    local registration_token=$(curl -s -X POST \
        -H "Authorization: Bearer $GITHUB_TOKEN" \
        -H "Accept: application/vnd.github.v3+json" \
        "https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/actions/runners/registration-token" | jq -r '.token')
    
    if [ "$registration_token" == "null" ] || [ -z "$registration_token" ]; then
        echo_error "Failed to get registration token"
        echo_info "Please check:"
        echo_info "1. GITHUB_TOKEN has 'repo' scope"
        echo_info "2. You have admin access to $REPO_OWNER/$REPO_NAME"
        echo_info "3. Token is valid and not expired"
        exit 1
    fi
    
    echo_success "Registration token obtained"
    
    # Configure runner as actions user
    echo_info "Configuring runner..."
    sudo -u actions bash -c "
        cd '$ACTIONS_RUNNER_DIR'
        ./config.sh --url https://github.com/$REPO_OWNER/$REPO_NAME \
                    --token $registration_token \
                    --name '$RUNNER_NAME' \
                    --labels '$RUNNER_LABELS' \
                    --work '_work' \
                    --unattended \
                    --replace
    "
    
    echo_success "Runner configured successfully"
}

# Install and start the service
setup_service() {
    echo_info "Setting up systemd service..."
    
    # Install service as actions user
    sudo -u actions bash -c "
        cd '$ACTIONS_RUNNER_DIR'
        sudo ./svc.sh install actions
    "
    
    # Start and enable service
    sudo ./svc.sh start
    sudo systemctl enable "$SERVICE_NAME"
    
    echo_success "Service installed and started"
}

# Test the runner
test_runner() {
    echo_info "Testing runner setup..."
    
    # Check service status
    if sudo systemctl is-active --quiet "$SERVICE_NAME"; then
        echo_success "Runner service is active"
    else
        echo_error "Runner service is not active"
        echo_info "Check logs with: sudo journalctl -u $SERVICE_NAME -f"
        return 1
    fi
    
    # Test Docker access
    if sudo -u actions docker info >/dev/null 2>&1; then
        echo_success "Docker access verified for actions user"
    else
        echo_warning "Docker access issue for actions user"
    fi
    
    # Test basic commands
    echo_info "Testing basic functionality..."
    sudo -u actions bash -c "
        cd '$ACTIONS_RUNNER_DIR'
        node --version && npm --version
    " || echo_warning "Node.js/npm test failed"
    
    echo_success "Runner tests completed"
}

# Display runner information
show_runner_info() {
    echo_info "=========================================="
    echo_info "Runner Setup Complete!"
    echo_info "=========================================="
    echo_info "Repository: https://github.com/$REPO_OWNER/$REPO_NAME"
    echo_info "Runner Name: $RUNNER_NAME"
    echo_info "Labels: $RUNNER_LABELS"
    echo_info "Service: $SERVICE_NAME"
    echo_info "Directory: $ACTIONS_RUNNER_DIR"
    echo_info ""
    echo_info "Useful Commands:"
    echo_info "  Check status: sudo systemctl status $SERVICE_NAME"
    echo_info "  View logs:    sudo journalctl -u $SERVICE_NAME -f"
    echo_info "  Stop runner:  sudo systemctl stop $SERVICE_NAME"
    echo_info "  Start runner: sudo systemctl start $SERVICE_NAME"
    echo_info ""
    echo_info "GitHub Runners: https://github.com/$REPO_OWNER/$REPO_NAME/settings/actions/runners"
    echo_info "=========================================="
}

# Main execution
main() {
    print_banner
    check_user
    check_dependencies
    check_github_token
    setup_runner_environment
    install_runner
    configure_runner
    setup_service
    test_runner
    show_runner_info
    
    echo_success "SwissKnife GitHub Actions runner setup completed successfully!"
}

# Run main function
main "$@"
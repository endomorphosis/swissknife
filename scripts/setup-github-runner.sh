#!/bin/bash

# GitHub Actions Self-Hosted Runner Setup Script
# For endomorphosis/swissknife repository

set -e

# Configuration
REPO_OWNER="endomorphosis"
REPO_NAME="swissknife"
RUNNER_NAME="swissknife-$(hostname)-$(date +%s)"
RUNNER_LABELS="self-hosted,linux,x64,docker,swissknife"
RUNNER_WORK_DIR="_work"
ACTIONS_RUNNER_DIR="/opt/actions-runner"
SERVICE_NAME="actions-runner"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   echo_error "This script should not be run as root for security reasons"
   echo_info "Please run as a regular user with sudo privileges"
   exit 1
fi

# Check for required tools
check_dependencies() {
    echo_info "Checking dependencies..."
    
    local deps=("curl" "tar" "docker" "git" "jq")
    local missing_deps=()
    
    for dep in "${deps[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            missing_deps+=("$dep")
        fi
    done
    
    if [ ${#missing_deps[@]} -ne 0 ]; then
        echo_error "Missing dependencies: ${missing_deps[*]}"
        echo_info "Please install missing dependencies and try again"
        exit 1
    fi
    
    echo_success "All dependencies are installed"
}

# Create actions runner user
create_runner_user() {
    echo_info "Creating actions runner user..."
    
    if id "actions" &>/dev/null; then
        echo_warning "User 'actions' already exists"
    else
        sudo useradd -m -s /bin/bash actions
        sudo usermod -aG docker actions
        echo_success "Created user 'actions' and added to docker group"
    fi
}

# Download and install GitHub Actions runner
install_runner() {
    echo_info "Installing GitHub Actions runner..."
    
    # Create runner directory
    sudo mkdir -p "$ACTIONS_RUNNER_DIR"
    
    # Get the latest runner version
    local latest_version=$(curl -s https://api.github.com/repos/actions/runner/releases/latest | jq -r '.tag_name' | sed 's/^v//')
    echo_info "Latest runner version: $latest_version"
    
    # Download runner
    local runner_file="actions-runner-linux-x64-${latest_version}.tar.gz"
    local download_url="https://github.com/actions/runner/releases/download/v${latest_version}/${runner_file}"
    
    echo_info "Downloading runner from: $download_url"
    cd /tmp
    curl -o "$runner_file" -L "$download_url"
    
    # Extract to runner directory
    sudo tar xzf "$runner_file" -C "$ACTIONS_RUNNER_DIR"
    sudo chown -R actions:actions "$ACTIONS_RUNNER_DIR"
    
    # Install dependencies
    sudo "$ACTIONS_RUNNER_DIR/bin/installdependencies.sh"
    
    echo_success "GitHub Actions runner installed to $ACTIONS_RUNNER_DIR"
}

# Configure the runner
configure_runner() {
    echo_info "Configuring GitHub Actions runner..."
    
    # Check if we have a GitHub token
    if [ -z "$GITHUB_TOKEN" ]; then
        echo_error "GITHUB_TOKEN environment variable is required"
        echo_info "Please set GITHUB_TOKEN with a personal access token that has 'repo' scope"
        echo_info "Example: export GITHUB_TOKEN=github_pat_xxxxxxxxxxxxx"
        exit 1
    fi
    
    # Get registration token
    echo_info "Getting registration token from GitHub..."
    local registration_token=$(curl -s -X POST \
        -H "Authorization: Bearer $GITHUB_TOKEN" \
        -H "Accept: application/vnd.github.v3+json" \
        "https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/actions/runners/registration-token" | jq -r '.token')
    
    if [ "$registration_token" == "null" ] || [ -z "$registration_token" ]; then
        echo_error "Failed to get registration token. Check your GITHUB_TOKEN permissions."
        exit 1
    fi
    
    echo_success "Got registration token"
    
    # Configure as actions user
    sudo -u actions bash -c "
        cd '$ACTIONS_RUNNER_DIR'
        ./config.sh --url https://github.com/$REPO_OWNER/$REPO_NAME \
                    --token $registration_token \
                    --name '$RUNNER_NAME' \
                    --labels '$RUNNER_LABELS' \
                    --work '$RUNNER_WORK_DIR' \
                    --unattended \
                    --replace
    "
    
    echo_success "Runner configured successfully"
}

# Create systemd service
create_service() {
    echo_info "Creating systemd service..."
    
    sudo tee /etc/systemd/system/$SERVICE_NAME.service > /dev/null <<EOF
[Unit]
Description=GitHub Actions Runner
After=network.target
Wants=network.target

[Service]
Type=simple
User=actions
Group=actions
WorkingDirectory=$ACTIONS_RUNNER_DIR
ExecStart=$ACTIONS_RUNNER_DIR/run.sh
Restart=always
RestartSec=15
TimeoutStartSec=0

# Security settings
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=$ACTIONS_RUNNER_DIR

# Environment
Environment=DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd and enable service
    sudo systemctl daemon-reload
    sudo systemctl enable $SERVICE_NAME
    
    echo_success "Systemd service created and enabled"
}

# Test Docker access
test_docker_access() {
    echo_info "Testing Docker access for actions user..."
    
    sudo -u actions docker --version
    sudo -u actions docker info > /dev/null
    
    echo_success "Docker access verified for actions user"
}

# Test the runner
test_runner() {
    echo_info "Testing runner installation..."
    
    # Start the service
    sudo systemctl start $SERVICE_NAME
    
    # Check status
    sleep 5
    if sudo systemctl is-active --quiet $SERVICE_NAME; then
        echo_success "Runner service is active"
    else
        echo_error "Runner service failed to start"
        sudo systemctl status $SERVICE_NAME
        exit 1
    fi
    
    # Check logs
    echo_info "Recent runner logs:"
    sudo journalctl -u $SERVICE_NAME --no-pager -n 10
}

# Display status
show_status() {
    echo_info "GitHub Actions Runner Setup Complete!"
    echo
    echo_info "Runner Details:"
    echo "  Name: $RUNNER_NAME"
    echo "  Labels: $RUNNER_LABELS"
    echo "  Directory: $ACTIONS_RUNNER_DIR"
    echo "  Service: $SERVICE_NAME"
    echo "  Repository: $REPO_OWNER/$REPO_NAME"
    echo
    echo_info "Service Commands:"
    echo "  Start:   sudo systemctl start $SERVICE_NAME"
    echo "  Stop:    sudo systemctl stop $SERVICE_NAME"
    echo "  Status:  sudo systemctl status $SERVICE_NAME"
    echo "  Logs:    sudo journalctl -u $SERVICE_NAME -f"
    echo
    echo_info "The runner is now active and will appear in:"
    echo "  https://github.com/$REPO_OWNER/$REPO_NAME/settings/actions/runners"
}

# Main execution
main() {
    echo_info "Starting GitHub Actions Self-Hosted Runner Setup"
    echo_info "Repository: $REPO_OWNER/$REPO_NAME"
    echo
    
    check_dependencies
    create_runner_user
    install_runner
    configure_runner
    create_service
    test_docker_access
    test_runner
    show_status
    
    echo_success "Setup completed successfully!"
}

# Handle script interruption
cleanup() {
    echo_warning "Setup interrupted. Cleaning up..."
    # Add any cleanup logic here if needed
    exit 1
}

trap cleanup INT TERM

# Check for help flag
if [[ "$1" == "--help" || "$1" == "-h" ]]; then
    cat << EOF
GitHub Actions Self-Hosted Runner Setup Script

Usage: $0

Prerequisites:
1. Set GITHUB_TOKEN environment variable with a personal access token
   The token needs 'repo' scope for the target repository
   
2. Run as a non-root user with sudo privileges

3. Ensure Docker is installed and running

Environment Variables:
  GITHUB_TOKEN  - GitHub personal access token (required)

Example:
  export GITHUB_TOKEN="github_pat_xxxxxxxxxxxxx"
  $0

The script will:
- Install the latest GitHub Actions runner
- Configure it for the $REPO_OWNER/$REPO_NAME repository
- Create a systemd service for automatic startup
- Set up proper permissions and security

EOF
    exit 0
fi

# Run main function
main "$@"
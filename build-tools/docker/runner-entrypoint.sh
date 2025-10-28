#!/bin/bash

# GitHub Actions Runner Entry Point Script
set -e

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

# Configuration
REPO_OWNER="${REPO_OWNER:-endomorphosis}"
REPO_NAME="${REPO_NAME:-swissknife}"
RUNNER_NAME="${RUNNER_NAME:-swissknife-docker-runner-$(hostname)}"
RUNNER_LABELS="${RUNNER_LABELS:-self-hosted,linux,docker,swissknife,container}"
RUNNER_WORK_DIR="${RUNNER_WORK_DIR:-_work}"

echo_info "Starting GitHub Actions Runner for $REPO_OWNER/$REPO_NAME"
echo_info "Runner Name: $RUNNER_NAME"
echo_info "Labels: $RUNNER_LABELS"

# Check for required environment variables
if [ -z "$GITHUB_TOKEN" ]; then
    echo_error "GITHUB_TOKEN environment variable is required"
    echo_info "Please provide a GitHub personal access token with 'repo' scope"
    exit 1
fi

# Function to cleanup on exit
cleanup() {
    echo_warning "Received shutdown signal, cleaning up..."
    if [ -f ".runner" ]; then
        echo_info "Removing runner registration..."
        ./config.sh remove --token "$GITHUB_TOKEN" || true
    fi
    echo_info "Cleanup complete"
    exit 0
}

# Set up signal handlers
trap cleanup SIGTERM SIGINT

# Start Docker daemon if not running
if ! docker info >/dev/null 2>&1; then
    echo_info "Starting Docker daemon..."
    sudo dockerd &
    sleep 5
fi

echo_success "Docker daemon is running"

# Get registration token from GitHub
echo_info "Getting registration token from GitHub..."
registration_token=$(curl -s -X POST \
    -H "Authorization: Bearer $GITHUB_TOKEN" \
    -H "Accept: application/vnd.github.v3+json" \
    "https://api.github.com/repos/$REPO_OWNER/$REPO_NAME/actions/runners/registration-token" | jq -r '.token')

if [ "$registration_token" == "null" ] || [ -z "$registration_token" ]; then
    echo_error "Failed to get registration token from GitHub"
    echo_error "Please check your GITHUB_TOKEN permissions"
    exit 1
fi

echo_success "Retrieved registration token"

# Remove existing runner configuration if it exists
if [ -f ".runner" ]; then
    echo_info "Removing existing runner configuration..."
    ./config.sh remove --token "$GITHUB_TOKEN" || true
fi

# Configure the runner
echo_info "Configuring GitHub Actions runner..."
./config.sh \
    --url "https://github.com/$REPO_OWNER/$REPO_NAME" \
    --token "$registration_token" \
    --name "$RUNNER_NAME" \
    --labels "$RUNNER_LABELS" \
    --work "$RUNNER_WORK_DIR" \
    --unattended \
    --replace

echo_success "Runner configured successfully"

# Display runner information
echo_info "Runner configuration complete:"
echo "  Repository: $REPO_OWNER/$REPO_NAME"
echo "  Name: $RUNNER_NAME"
echo "  Labels: $RUNNER_LABELS"
echo "  Work Directory: $RUNNER_WORK_DIR"
echo "  Runner Directory: $(pwd)"

# Start a simple health check server in background
(
    echo_info "Starting health check server on port 8080..."
    while true; do
        echo -e "HTTP/1.1 200 OK\r\n\r\nRunner Status: $(if [ -f ".runner" ]; then echo "Active"; else echo "Inactive"; fi)" | nc -l -p 8080 -q 1 2>/dev/null || true
        sleep 1
    done
) &

# Start the runner
echo_info "Starting GitHub Actions runner..."
exec ./run.sh
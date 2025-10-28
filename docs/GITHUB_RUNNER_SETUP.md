# GitHub Actions Self-Hosted Runner Setup for SwissKnife

This guide helps you set up GitHub Actions self-hosted runners on your machine for the `endomorphosis/swissknife` repository with Docker container support.

## Quick Start

### Prerequisites

1. **System Requirements:**
   - Linux (Ubuntu 20.04+ recommended)
   - Docker installed and running
   - Git installed
   - Sudo privileges
   - 8GB+ RAM, 50GB+ disk space

2. **GitHub Requirements:**
   - GitHub Personal Access Token with `repo` scope
   - Access to the `endomorphosis/swissknife` repository

### Automated Setup

1. **Set your GitHub token:**
   ```bash
   export GITHUB_TOKEN="github_pat_xxxxxxxxxxxxx"
   ```

2. **Run the setup script:**
   ```bash
   cd /home/barberb/swissknife
   ./scripts/setup-github-runner.sh
   ```

3. **Verify the runner:**
   - Check status: `sudo systemctl status actions-runner`
   - View logs: `sudo journalctl -u actions-runner -f`
   - Check GitHub: https://github.com/endomorphosis/swissknife/settings/actions/runners

## Manual Setup (Alternative)

### 1. Install Dependencies

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install required packages
sudo apt install -y curl tar git jq build-essential

# Verify Docker is running
docker --version
sudo systemctl status docker
```

### 2. Create Runner User

```bash
# Create dedicated user for the runner
sudo useradd -m -s /bin/bash actions
sudo usermod -aG docker actions
```

### 3. Download and Install Runner

```bash
# Create runner directory
sudo mkdir -p /opt/actions-runner
cd /opt/actions-runner

# Get latest runner version
RUNNER_VERSION=$(curl -s https://api.github.com/repos/actions/runner/releases/latest | jq -r '.tag_name' | sed 's/^v//')

# Download and extract runner
sudo curl -o actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz -L \
  https://github.com/actions/runner/releases/download/v${RUNNER_VERSION}/actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz

sudo tar xzf actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz
sudo rm actions-runner-linux-x64-${RUNNER_VERSION}.tar.gz

# Install dependencies
sudo ./bin/installdependencies.sh

# Set ownership
sudo chown -R actions:actions /opt/actions-runner
```

### 4. Configure Runner

```bash
# Get registration token (requires GITHUB_TOKEN)
export GITHUB_TOKEN="your_github_token_here"

REGISTRATION_TOKEN=$(curl -s -X POST \
  -H "Authorization: Bearer $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  "https://api.github.com/repos/endomorphosis/swissknife/actions/runners/registration-token" | jq -r '.token')

# Configure as actions user
sudo -u actions bash -c "
  cd /opt/actions-runner
  ./config.sh --url https://github.com/endomorphosis/swissknife \
              --token $REGISTRATION_TOKEN \
              --name swissknife-$(hostname)-$(date +%s) \
              --labels self-hosted,linux,x64,docker,swissknife \
              --work _work \
              --unattended \
              --replace
"
```

### 5. Create System Service

```bash
# Create systemd service file
sudo tee /etc/systemd/system/actions-runner.service > /dev/null <<EOF
[Unit]
Description=GitHub Actions Runner
After=network.target
Wants=network.target

[Service]
Type=simple
User=actions
Group=actions
WorkingDirectory=/opt/actions-runner
ExecStart=/opt/actions-runner/run.sh
Restart=always
RestartSec=15
TimeoutStartSec=0

# Security settings
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=/opt/actions-runner

# Environment
Environment=DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=1

[Install]
WantedBy=multi-user.target
EOF

# Enable and start service
sudo systemctl daemon-reload
sudo systemctl enable actions-runner
sudo systemctl start actions-runner
```

## Docker Support

### Using Docker Compose

The repository includes a `docker-compose.yml` file with runner support:

```bash
# Set environment variables
export GITHUB_TOKEN="your_github_token_here"

# Start runner in Docker
docker-compose up -d github-runner

# View runner logs
docker-compose logs -f github-runner

# Stop runner
docker-compose down
```

### Manual Docker Run

```bash
# Build runner image
docker build -f build-tools/docker/Dockerfile.runner -t swissknife-runner .

# Run runner container
docker run -d \
  --name swissknife-runner \
  --restart unless-stopped \
  -e GITHUB_TOKEN="$GITHUB_TOKEN" \
  -e REPO_OWNER=endomorphosis \
  -e REPO_NAME=swissknife \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v $(pwd)/runner-data:/runner/_work \
  --privileged \
  swissknife-runner
```

## Testing the Setup

### 1. Verify Runner Status

```bash
# Check service status
sudo systemctl status actions-runner

# View recent logs
sudo journalctl -u actions-runner --no-pager -n 20

# Test Docker access
sudo -u actions docker ps
```

### 2. Test Build Process

```bash
# Test local build
npm install --legacy-peer-deps
npm run build:all

# Test Docker build
docker build -f build-tools/docker/Dockerfile -t swissknife:test .

# Test multi-arch build
docker buildx build --platform linux/amd64,linux/arm64 -t swissknife:multiarch .
```

### 3. Trigger CI/CD Pipeline

1. **Push to trigger CI:**
   ```bash
   git add .
   git commit -m "Test self-hosted runner"
   git push origin main
   ```

2. **Check GitHub Actions:**
   - Go to: https://github.com/endomorphosis/swissknife/actions
   - Verify workflows run on your self-hosted runner
   - Check runner appears in: https://github.com/endomorphosis/swissknife/settings/actions/runners

## Management Commands

### Service Control

```bash
# Start runner
sudo systemctl start actions-runner

# Stop runner
sudo systemctl stop actions-runner

# Restart runner
sudo systemctl restart actions-runner

# Check status
sudo systemctl status actions-runner

# View logs
sudo journalctl -u actions-runner -f
```

### Docker Management

```bash
# View Docker containers
docker ps -a

# Check Docker logs
docker logs swissknife-runner

# Restart Docker runner
docker restart swissknife-runner

# Clean up Docker resources
docker system prune -f
```

### Runner Management

```bash
# Reconfigure runner (if needed)
cd /opt/actions-runner
sudo -u actions ./config.sh remove --token "$GITHUB_TOKEN"
sudo -u actions ./config.sh --url https://github.com/endomorphosis/swissknife --token "$NEW_TOKEN" ...

# Update runner
./scripts/setup-github-runner.sh  # Will replace existing runner
```

## Troubleshooting

### Common Issues

1. **Runner not appearing in GitHub:**
   - Check GITHUB_TOKEN permissions
   - Verify network connectivity
   - Check service logs

2. **Docker build failures:**
   - Ensure Docker daemon is running
   - Check disk space
   - Verify user in docker group

3. **Permission issues:**
   - Check file ownership: `sudo chown -R actions:actions /opt/actions-runner`
   - Verify docker group membership: `groups actions`

### Debugging Commands

```bash
# Check runner configuration
sudo -u actions cat /opt/actions-runner/.runner

# Test GitHub API access
curl -H "Authorization: Bearer $GITHUB_TOKEN" \
  https://api.github.com/repos/endomorphosis/swissknife

# Check Docker access
sudo -u actions docker info

# Verify service file
sudo systemctl cat actions-runner
```

## Security Considerations

1. **Token Security:**
   - Use Personal Access Tokens with minimal required scopes
   - Rotate tokens regularly
   - Store tokens securely (environment variables, not in code)

2. **System Security:**
   - Runner runs as dedicated `actions` user
   - Limited sudo access
   - Docker socket access controlled

3. **Network Security:**
   - Firewall rules for necessary ports only
   - Monitor network traffic from runner

## Advanced Configuration

### Custom Labels

Add custom labels to target specific runners:

```bash
./config.sh --labels "self-hosted,linux,x64,docker,swissknife,gpu,high-memory"
```

### Multiple Runners

Run multiple runners on the same machine:

```bash
# Create additional runner directories
sudo mkdir -p /opt/actions-runner-2
# Follow same setup process with different names
```

### Runner Groups

Organize runners into groups (Enterprise/Organization feature):

```bash
./config.sh --runnergroup "swissknife-production"
```

## Monitoring and Alerts

### Basic Monitoring

```bash
# Create monitoring script
cat > /opt/actions-runner/monitor.sh << 'EOF'
#!/bin/bash
if ! systemctl is-active --quiet actions-runner; then
  echo "Runner service is down!" | mail -s "Runner Alert" admin@example.com
fi
EOF

# Add to crontab
echo "*/5 * * * * /opt/actions-runner/monitor.sh" | sudo -u actions crontab -
```

### Log Rotation

```bash
# Configure logrotate
sudo tee /etc/logrotate.d/actions-runner << EOF
/opt/actions-runner/_diag/*.log {
    daily
    rotate 7
    compress
    missingok
    notifempty
}
EOF
```

## Performance Optimization

### System Tuning

```bash
# Optimize for CI workloads
echo 'vm.swappiness=10' | sudo tee -a /etc/sysctl.conf
echo 'fs.file-max=2097152' | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

### Docker Optimization

```bash
# Configure Docker daemon for CI
sudo tee /etc/docker/daemon.json << EOF
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "10m",
    "max-file": "3"
  },
  "storage-driver": "overlay2",
  "default-ulimits": {
    "nofile": {
      "Hard": 64000,
      "Name": "nofile",
      "Soft": 64000
    }
  }
}
EOF

sudo systemctl restart docker
```

---

For more information, visit:
- [GitHub Actions Self-Hosted Runners Documentation](https://docs.github.com/en/actions/hosting-your-own-runners)
- [SwissKnife Repository](https://github.com/endomorphosis/swissknife)
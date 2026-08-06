# SwissKnife GitHub Actions Self-Hosted Runner Setup Guide

This guide will help you set up a GitHub Actions self-hosted runner on this machine (`workstation`) and integrate it with Docker container testing for the SwissKnife project.

## Quick Setup

### 1. Prerequisites Check

First, verify your system meets the requirements:

```bash
# Check system info
uname -a
docker --version
git --version
curl --version

# Verify Docker access
docker info
docker ps
```

### 2. Set GitHub Token

You need a GitHub Personal Access Token with `repo` scope:

1. Go to: https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Name: "SwissKnife Self-Hosted Runner"
4. Select the `repo` scope (full control of private repositories)
5. Click "Generate token"
6. Copy the token and set it:

```bash
export GITHUB_TOKEN="github_pat_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

### 3. Run the Setup Script

```bash
cd /home/devel/swissknife
./scripts/ci/setup-swissknife-runner.sh
```

This script will:
- ✅ Check system dependencies
- ✅ Validate GitHub token
- ✅ Create dedicated runner environment
- ✅ Download and install GitHub Actions runner
- ✅ Configure runner with GitHub
- ✅ Set up systemd service
- ✅ Test the installation

## Current Environment Status

Based on the analysis of your system:

### ✅ Existing Setup
- **Architecture**: x86_64 (Intel/AMD 64-bit)
- **OS**: Ubuntu 24.04.3 LTS
- **Docker**: v28.5.1 (running and accessible)
- **Resources**: 40 CPUs, 440.8GB RAM (excellent for CI/CD)
- **Existing Runners**: You already have runners for other repositories:
  - `ipfs_accelerate_py`
  - `ipfs_datasets_py` 
  - `ipfs_kit_py`

### 🎯 What We're Adding
- **New Runner**: Dedicated SwissKnife runner
- **Labels**: `self-hosted,linux,x64,docker,swissknife,workstation`
- **Docker Integration**: Full container build/test pipeline
- **Multi-arch Support**: Ready for ARM64 builds if needed

## Workflow Integration

The new workflows will automatically use your self-hosted runner:

### 1. Docker Integration Workflow
- **File**: `.github/workflows/docker-integration.yml`
- **Triggers**: Push to main/develop, PRs, manual dispatch
- **Features**:
  - ✅ Docker image build and test
  - ✅ Container startup verification
  - ✅ CLI functionality testing
  - ✅ Docker Compose integration
  - ✅ Performance benchmarking
  - ✅ Security scanning
  - ✅ Multi-architecture builds (optional)

### 2. Self-Hosted ARM64 Workflow
- **File**: `.github/workflows/self-hosted-arm64.yml`
- **Features**: Ready for ARM64 runners (when available)

## Testing the Setup

### 1. Manual Test
After setup, test the runner manually:

```bash
# Check runner service
sudo systemctl status actions.runner.endomorphosis-swissknife.*

# View logs
sudo journalctl -u actions.runner.endomorphosis-swissknife.* -f

# Test Docker access
sudo -u actions docker ps
```

### 2. GitHub Interface
Visit: https://github.com/endomorphosis/swissknife/settings/actions/runners

You should see your new runner listed with status "Online".

### 3. Trigger a Test Build

Push a commit or manually trigger the workflow:

```bash
# Make a test change
echo "# Test Runner Setup" >> TEST_RUNNER.md
git add TEST_RUNNER.md
git commit -m "test: trigger self-hosted runner test"
git push origin main
```

Watch the workflow at: https://github.com/endomorphosis/swissknife/actions

## Docker Test Suite

The Docker integration includes comprehensive testing:

### Build Tests
- ✅ Image build with multi-stage Dockerfile
- ✅ Image size and layer analysis
- ✅ Security vulnerability scanning
- ✅ Metadata validation

### Runtime Tests
- ✅ Container startup and health checks
- ✅ CLI functionality verification
- ✅ Network connectivity tests
- ✅ Docker Compose integration
- ✅ Performance benchmarking

### Container Tests
- ✅ Resource usage monitoring
- ✅ Log analysis
- ✅ Multi-architecture builds (when enabled)
- ✅ Registry push/pull operations

## Advanced Configuration

### Custom Runner Labels

The runner is configured with these labels:
- `self-hosted` - Indicates it's not GitHub-hosted
- `linux` - Operating system
- `x64` - Architecture
- `docker` - Docker capability
- `swissknife` - Project-specific
- `workstation` - Machine identifier

### Workflow Customization

You can customize the Docker integration workflow by:

1. **Manual Dispatch Options**:
   - Toggle Docker test suite
   - Enable multi-architecture builds

2. **Environment Variables**:
   ```yaml
   env:
     NODE_ENV: test
     DOCKER_BUILDKIT: 1
     CUSTOM_SETTING: value
   ```

3. **Build Arguments**:
   ```yaml
   build-args: |
     NODE_VERSION=20
     BUILD_ENV=production
   ```

## Troubleshooting

### Common Issues

1. **Runner Not Appearing Online**
   ```bash
   # Check service status
   sudo systemctl status actions.runner.*
   
   # Restart if needed
   sudo systemctl restart actions.runner.*
   ```

2. **Docker Permission Issues**
   ```bash
   # Ensure actions user is in docker group
   sudo usermod -aG docker actions
   
   # Test access
   sudo -u actions docker ps
   ```

3. **GitHub Token Issues**
   - Verify token has `repo` scope
   - Check token hasn't expired
   - Ensure repository access permissions

4. **Workflow Not Using Self-Hosted Runner**
   - Check `runs-on` labels in workflow files
   - Verify runner labels match workflow requirements
   - Ensure runner is online and idle

### Logs and Monitoring

```bash
# Runner service logs
sudo journalctl -u actions.runner.endomorphosis-swissknife.* -f

# Docker logs during tests
docker logs <container_name>

# System resource monitoring
htop
docker stats
```

## Maintenance

### Regular Tasks

1. **Update Runner**:
   ```bash
   cd /opt/actions-runner-swissknife
   sudo -u actions ./config.sh remove
   # Re-run setup script to get latest version
   ```

2. **Clean Docker Environment**:
   ```bash
   docker system prune -f
   docker image prune -af
   ```

3. **Monitor Resources**:
   ```bash
   df -h  # Disk space
   free -h  # Memory usage
   docker system df  # Docker space usage
   ```

### Backup Configuration

```bash
# Backup runner configuration
sudo cp -r /opt/actions-runner-swissknife /backup/actions-runner-swissknife-$(date +%Y%m%d)
```

## Security Considerations

1. **Isolation**: The runner runs as the `actions` user for isolation
2. **Docker Security**: Containers run with limited privileges
3. **Token Management**: GitHub token is only used for registration
4. **Network Security**: Only necessary ports are exposed during tests
5. **Resource Limits**: Consider setting Docker resource limits if needed

## Next Steps

1. ✅ Run the setup script: `./scripts/ci/setup-swissknife-runner.sh`
2. ✅ Verify runner appears online in GitHub
3. ✅ Test with a simple workflow trigger
4. ✅ Monitor first few builds for any issues
5. ✅ Set up monitoring/alerting if desired

## Support

- **GitHub Issues**: https://github.com/endomorphosis/swissknife/issues
- **Runner Logs**: Available via systemd journal
- **Docker Documentation**: https://docs.docker.com/
- **GitHub Actions Documentation**: https://docs.github.com/en/actions

---

*This setup leverages your powerful workstation (40 CPUs, 440GB RAM) to provide fast, reliable CI/CD for the SwissKnife project with full Docker integration testing.*
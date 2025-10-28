#!/bin/bash

# Test script for ARM64 GitHub Actions Runner setup
echo "=== SwissKnife ARM64 Runner Test ==="
echo ""

# Check system info
echo "🖥️  System Information:"
echo "   OS: $(uname -s)"
echo "   Architecture: $(uname -m)"
echo "   Hostname: $(hostname)"
echo "   User: $(whoami)"
echo ""

# Check Node.js
echo "📦 Node.js Information:"
if command -v node &> /dev/null; then
    echo "   Node version: $(node --version)"
    echo "   NPM version: $(npm --version)"
else
    echo "   ❌ Node.js not found"
fi
echo ""

# Check Docker
echo "🐳 Docker Information:"
if command -v docker &> /dev/null; then
    echo "   Docker version: $(docker --version)"
    if docker info &> /dev/null; then
        echo "   ✅ Docker daemon is running"
    else
        echo "   ❌ Docker daemon is not running"
    fi
else
    echo "   ❌ Docker not found"
fi
echo ""

# Check runner installation
echo "🏃 GitHub Actions Runner:"
if [ -d "/opt/actions-runner" ]; then
    echo "   ✅ Runner directory exists: /opt/actions-runner"
    if [ -f "/opt/actions-runner/config.sh" ]; then
        echo "   ✅ Runner files installed"
        if [ -f "/opt/actions-runner/.runner" ]; then
            echo "   ✅ Runner is configured"
            if sudo -u actions /opt/actions-runner/svc.sh status &> /dev/null; then
                echo "   ✅ Runner service is active"
            else
                echo "   ⚠️  Runner service is not active"
            fi
        else
            echo "   ⚠️  Runner is not configured yet"
        fi
    else
        echo "   ❌ Runner files not found"
    fi
else
    echo "   ❌ Runner directory not found"
fi
echo ""

# Check build capability
echo "🔨 Build Test:"
cd /home/barberb/swissknife

if [ -f "package.json" ]; then
    echo "   ✅ SwissKnife project found"
    
    if [ -d "node_modules" ]; then
        echo "   ✅ Dependencies installed"
    else
        echo "   ⚠️  Dependencies not installed (run: npm install --legacy-peer-deps)"
    fi
    
    if [ -f "cli.mjs" ]; then
        echo "   ✅ CLI built"
        if ./cli.mjs --version &> /dev/null; then
            echo "   ✅ CLI executable"
        else
            echo "   ⚠️  CLI not executable"
        fi
    else
        echo "   ⚠️  CLI not built (run: npm run build:all)"
    fi
else
    echo "   ❌ SwissKnife project not found"
fi
echo ""

echo "📋 Next Steps:"
if [ ! -f "/opt/actions-runner/.runner" ]; then
    echo "   1. Go to: https://github.com/endomorphosis/swissknife/settings/actions/runners"
    echo "   2. Click 'New self-hosted runner' and select 'Linux' + 'ARM64'"
    echo "   3. Copy the registration token and run:"
    echo "      cd /opt/actions-runner"
    echo "      sudo -u actions ./config.sh --url https://github.com/endomorphosis/swissknife \\"
    echo "                                  --token YOUR_TOKEN_HERE \\"
    echo "                                  --name swissknife-$(hostname)-arm64 \\"
    echo "                                  --labels self-hosted,linux,arm64,docker,swissknife \\"
    echo "                                  --unattended"
    echo "   4. Install and start the service:"
    echo "      sudo -u actions ./svc.sh install"
    echo "      sudo -u actions ./svc.sh start"
else
    echo "   ✅ Runner is configured and ready!"
    echo "   📊 Check runner status: sudo -u actions /opt/actions-runner/svc.sh status"
    echo "   📝 View runner logs: sudo journalctl -u actions.runner.* -f"
    echo "   🔗 GitHub Runners: https://github.com/endomorphosis/swissknife/settings/actions/runners"
fi
echo ""
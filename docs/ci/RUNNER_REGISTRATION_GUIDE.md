### GitHub Actions Runner Registration Instructions

## ❌ What Went Wrong:
The previous command failed because:
1. **Missing `--token` parameter** (this is REQUIRED)
2. **Malformed syntax** - the labels were incorrectly formatted
3. **GitHub returned 404** because no valid token was provided

## ✅ Correct Process:

### Step 1: Get Registration Token from GitHub
1. Open: https://github.com/endomorphosis/swissknife/settings/actions/runners
2. Click **"New self-hosted runner"**
3. Select: **Linux** + **ARM64** 
4. Copy the **TOKEN** from the configuration command shown on GitHub

### Step 2: Run Configuration with Proper Syntax
```bash
cd /opt/actions-runner
sudo -u actions ./config.sh --url https://github.com/endomorphosis/swissknife \
                            --token YOUR_REGISTRATION_TOKEN_HERE \
                            --name swissknife-spark-b271-arm64 \
                            --labels self-hosted,linux,arm64,docker,swissknife \
                            --work _work \
                            --unattended
```

### Step 3: Install and Start Service
```bash
sudo -u actions ./svc.sh install
sudo -u actions ./svc.sh start
```

### Step 4: Verify It's Working
```bash
sudo -u actions ./svc.sh status
```

## 📋 Current Status:
- ✅ ARM64 runner installed at `/opt/actions-runner`
- ✅ User `actions` configured with proper permissions
- ✅ Docker access verified
- ✅ SwissKnife project builds successfully
- ⏳ **Waiting for GitHub registration token**

## ⚠️ Important Notes:
- **Registration tokens expire quickly** - get a fresh one from GitHub
- **Must use the exact token** shown in GitHub's web interface
- **Labels format is critical** - use commas, no spaces around commas
- **ARM64 architecture** is correctly configured for your system

## 🚀 After Registration:
Once registered, the runner will:
- Appear in your GitHub repository settings
- Automatically pick up workflow jobs with matching labels
- Build and test SwissKnife on native ARM64 hardware
- Support Docker container builds without emulation
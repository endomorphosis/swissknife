# SwissKnife Web Desktop - Unified Build System

## 🎯 Overview

This document outlines the **unified build system** that consolidates the previously scattered web build architecture into a single, maintainable solution.

## 🚨 Problem Solved

**Before (problematic):**
- 6+ different webpack configs (`webpack.config.js`, `webpack.browser.config.js`, `webpack.enhanced.config.js`, etc.)
- Multiple HTML entry points (`index.html`, `swissknife-working.html`, etc.)
- Dual package.json systems (root + web/)
- Legacy JavaScript + Modern TypeScript running in parallel
- Multiple stlite loading strategies causing timeout errors
- Inconsistent app registration and lifecycle management

**After (unified):**
- ✅ **Single webpack config**: `webpack.unified.config.js`
- ✅ **Single entry point**: `web/src/unified-main.ts`
- ✅ **Single HTML template**: `web/templates/unified.html`
- ✅ **Consolidated build scripts** in root `package.json`
- ✅ **Unified stlite management** via `StliteManager`
- ✅ **Consistent app architecture** for all applications

## 🏗️ Architecture

### Build System
```
webpack.unified.config.js           # Single webpack configuration
├── Entry: web/src/unified-main.ts  # Main TypeScript entry point
├── Template: web/templates/unified.html
├── Output: web/dist/
└── Assets: web/assets/, web/css/
```

### Application Structure
```
web/src/
├── unified-main.ts                 # Main application entry
├── core/
│   ├── stlite-manager.ts          # Unified stlite integration
│   ├── desktop-manager.ts         # Desktop environment
│   └── window-manager.ts          # Window management
└── apps/
    ├── streamlit-editor.ts        # Unified Streamlit editor (replaces vibecode.js)
    ├── terminal.ts                # Terminal application
    ├── ai-chat.ts                 # AI chat interface
    └── [other apps...]
```

## 🚀 Usage

### Development
```bash
# Start development server with hot reload
npm run web:serve

# Build for development (with source maps)
npm run web:dev
```

### Production
```bash
# Build for production (optimized)
npm run web:build

# Serve production build locally
cd web/dist && npx http-server
```

### Legacy Support
```bash
# Use old system if needed (not recommended)
npm run web:legacy
```

## 🔧 Migration

To migrate from the old system to the unified one:

```bash
# Run the migration script
./migrate-to-unified.sh

# Or manually:
npm run web:build
```

The migration script will:
1. Backup existing files
2. Build the unified system
3. Provide clear next steps

## 🎯 Key Features

### Unified Stlite Integration
- **Single source of truth** for Streamlit functionality
- **Guaranteed availability** with fallback mock system
- **Background loading** of real stlite without blocking
- **Consistent error handling** and status reporting

### Streamlit Editor (Replaces VibeCode)
- **Real-time editing** with syntax highlighting
- **Instant preview** of Streamlit apps
- **Template system** for common patterns
- **Auto-save** functionality
- **Error handling** with helpful messages

### Application Management
- **Unified registration** system for all apps
- **Consistent lifecycle** management
- **Shared context** (SwissKnife core, stlite, windows)
- **Type-safe** interfaces

## 📦 Dependencies

The unified system consolidates dependencies:

```json
{
  "webpack": "^5.88.0",
  "typescript": "^5.1.0", 
  "ts-loader": "^9.4.0",
  "@stlite/browser": "^0.83.0"
}
```

## 🔍 Debugging

### Development Tools
```javascript
// Access global app instance
window.swissknife

// Check stlite status
window.swissknife.stlite.getStatus()

// Launch apps programmatically  
window.swissknife.launchApp('streamlit-editor')
```

### Build Analysis
```bash
# Analyze bundle size
npm run web:analyze
```

## 🚦 Status

- ✅ **Core unified system** implemented
- ✅ **Streamlit Editor** fully functional
- ✅ **Stlite management** unified
- ✅ **Build system** consolidated
- ⏳ **Migration from legacy apps** (in progress)
- ⏳ **Full TypeScript coverage** (in progress)

## 🛠️ Contributing

When adding new applications:

1. Create TypeScript class in `web/src/apps/`
2. Implement required interfaces (`render()`, `onMount()`)
3. Register in `unified-main.ts`
4. Use shared context for SwissKnife/stlite integration

## 📖 References

- [Webpack Configuration](webpack.unified.config.js)
- [Main Application](web/src/unified-main.ts)
- [Stlite Manager](web/src/core/stlite-manager.ts)
- [Streamlit Editor](web/src/apps/streamlit-editor.ts)

---

**Migration Date**: $(date)  
**Status**: ✅ Ready for production use

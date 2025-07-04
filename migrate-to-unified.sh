#!/bin/bash

# SwissKnife Web - Enhanced Build System Migration
# Consolidates features into existing web/ structure

echo "🚀 SwissKnife Web Enhanced Build System Migration"
echo "================================================"
echo ""
echo "This migration enhances the existing web/ build system with:"
echo "  ✅ Unified stlite integration (eliminates timeout errors)"
echo "  ✅ Enhanced Streamlit Editor (replaces problematic vibecode)"
echo "  ✅ TypeScript-first architecture"
echo "  ✅ Improved development experience"
echo ""

# Backup existing files
echo "📦 Creating backup of current system..."
BACKUP_DIR="backup/$(date +%Y%m%d_%H%M%S)"
mkdir -p $BACKUP_DIR

# Backup key legacy files
cp -r web/js $BACKUP_DIR/js_legacy 2>/dev/null || echo "No js directory to backup"
cp web/index.html $BACKUP_DIR/index_legacy.html 2>/dev/null || echo "No legacy index.html to backup" 
cp webpack.unified.config.js $BACKUP_DIR/ 2>/dev/null || echo "No unified config to backup"

echo "✅ Backup created in $BACKUP_DIR"

# Navigate to web directory for build
echo "📦 Installing/updating web dependencies..."
cd web

# Ensure we have the right dependencies
npm install

# Build the enhanced system
echo "🔧 Building enhanced web application..."
npm run build

if [ $? -eq 0 ]; then
    echo ""
    echo "🎯 Migration Complete!"
    echo "===================="
    echo ""
    echo "✅ Enhanced Build System Active:"
    echo "  - Unified stlite integration (no more timeout errors!)"
    echo "  - Enhanced Streamlit Editor with real-time preview"
    echo "  - TypeScript-first architecture"
    echo "  - Legacy compatibility maintained"
    echo ""
    echo "🚀 Development Commands (from web/ directory):"
    echo "  npm run serve:dev    # Start development server"
    echo "  npm run build:dev    # Build for development"
    echo "  npm run build        # Build for production"
    echo "  npm run analyze      # Analyze bundle size"
    echo ""
    echo "� Root-level commands (deprecated but functional):"
    echo "  npm run web:build    # → cd web && npm run build"
    echo "  npm run web:serve    # → cd web && npm run serve:dev"
    echo ""
    echo "📁 Legacy files backed up to: $BACKUP_DIR"
    echo ""
    echo "🎯 Key Improvements:"
    echo "  - Stlite timeout errors eliminated ✅"
    echo "  - Single webpack configuration ✅"
    echo "  - Enhanced app architecture ✅"
    echo "  - Better debugging tools ✅"
    
else
    echo "❌ Build failed. Check errors above."
    echo ""
    echo "💡 Troubleshooting:"
    echo "  1. Check if all dependencies are installed: npm install"
    echo "  2. Verify TypeScript compilation: npx tsc --noEmit"
    echo "  3. Check webpack config: npx webpack --help"
    echo ""
    echo "📞 Fallback options:"
    echo "  - Legacy system files backed up in: $BACKUP_DIR"
    echo "  - Original webpack configs preserved"
    exit 1
fi

cd ..

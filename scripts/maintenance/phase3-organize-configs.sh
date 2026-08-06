#!/bin/bash
# Phase 3: Organize Active Configurations
# This script moves active configuration files to their proper directories and updates references
# Risk Level: MEDIUM - Affects active configurations, requires import path updates

set -e  # Exit on any error

echo "🚀 Starting Phase 3: Organizing active configurations..."
echo "📍 Working directory: $(pwd)"

# Verify we're in the correct directory and previous phases were completed
if [[ ! -f "package.json" ]]; then
    echo "❌ Error: Not in project root directory (package.json not found)"
    exit 1
fi

if [[ ! -d "config/jest" ]] || [[ ! -d "scripts/archive" ]]; then
    echo "❌ Error: Previous phases not completed"
    echo "   Please run Phase 1 and Phase 2 scripts first"
    exit 1
fi

echo "📋 Creating backup of current state..."
# Create backup list
ls -la > pre-phase3-file-list.txt

echo "📁 Moving Jest configurations to config/jest/..."

# Move active Jest configs
if [[ -f "jest.config.cjs" ]]; then
    mv jest.config.cjs config/jest/
    echo "   ✅ Moved jest.config.cjs"
fi

if [[ -f "jest.hybrid.config.cjs" ]]; then
    mv jest.hybrid.config.cjs config/jest/
    echo "   ✅ Moved jest.hybrid.config.cjs"
fi

if [[ -f "babel.config.cjs" ]]; then
    mv babel.config.cjs config/jest/
    echo "   ✅ Moved babel.config.cjs"
fi

if [[ -f "babel.config.js.bak" ]]; then
    mv babel.config.js.bak config/archive/
    echo "   ✅ Archived babel.config.js.bak"
fi

echo "📁 Moving TypeScript configurations to config/typescript/..."

# Move TypeScript configs
if [[ -f "tsconfig.json" ]]; then
    mv tsconfig.json config/typescript/
    echo "   ✅ Moved tsconfig.json"
fi

if [[ -f "tsconfig.test.json" ]]; then
    mv tsconfig.test.json config/typescript/
    echo "   ✅ Moved tsconfig.test.json"
fi

if [[ -f "tsconfig.jest.json" ]]; then
    mv tsconfig.jest.json config/typescript/
    echo "   ✅ Moved tsconfig.jest.json"
fi

echo "📁 Moving build configurations to build-tools/configs/..."

# Move build and project configs
if [[ -f "codecov.yml" ]]; then
    mv codecov.yml build-tools/configs/
    echo "   ✅ Moved codecov.yml"
fi

if [[ -f "sonar-project.properties" ]]; then
    mv sonar-project.properties build-tools/configs/
    echo "   ✅ Moved sonar-project.properties"
fi

if [[ -f ".prettierrc" ]]; then
    mv .prettierrc build-tools/configs/
    echo "   ✅ Moved .prettierrc"
fi

if [[ -f ".prettierignore" ]]; then
    mv .prettierignore build-tools/configs/
    echo "   ✅ Moved .prettierignore"
fi

if [[ -f ".eslintrc.js" ]]; then
    mv .eslintrc.js build-tools/configs/
    echo "   ✅ Moved .eslintrc.js"
fi

echo "📁 Moving Docker files to build-tools/docker/..."

# Move Docker files
if [[ -f "Dockerfile" ]]; then
    mv Dockerfile build-tools/docker/
    echo "   ✅ Moved Dockerfile"
fi

if [[ -f "docker-compose.yml" ]]; then
    mv docker-compose.yml build-tools/docker/
    echo "   ✅ Moved docker-compose.yml"
fi

echo "🔧 Updating package.json to reference new configuration paths..."

# Update package.json scripts to use new paths
sed -i.bak 's|--config=jest\.config\.cjs|--config=config/jest/jest.config.cjs|g' package.json
sed -i.bak 's|--config=jest\.hybrid\.config\.cjs|--config=config/jest/jest.hybrid.config.cjs|g' package.json
sed -i.bak 's|jest\.config\.cjs|config/jest/jest.config.cjs|g' package.json
sed -i.bak 's|jest\.hybrid\.config\.cjs|config/jest/jest.hybrid.config.cjs|g' package.json

echo "   ✅ Updated Jest config references in package.json"

echo "🔧 Creating configuration symlinks for backward compatibility..."

# Create symlinks for immediate backward compatibility
ln -sf config/jest/jest.config.cjs jest.config.cjs
ln -sf config/jest/jest.hybrid.config.cjs jest.hybrid.config.cjs
ln -sf config/typescript/tsconfig.json tsconfig.json

echo "   ✅ Created backward compatibility symlinks"

echo "🔧 Updating TypeScript configuration references..."

# Update Jest configs to reference new TypeScript config paths
if [[ -f "config/jest/jest.config.cjs" ]]; then
    sed -i.bak 's|"tsconfig.test.json"|"../typescript/tsconfig.test.json"|g' config/jest/jest.config.cjs
    sed -i.bak 's|"tsconfig.jest.json"|"../typescript/tsconfig.jest.json"|g' config/jest/jest.config.cjs
    echo "   ✅ Updated TypeScript references in jest.config.cjs"
fi

if [[ -f "config/jest/jest.hybrid.config.cjs" ]]; then
    sed -i.bak 's|"tsconfig.test.json"|"../typescript/tsconfig.test.json"|g' config/jest/jest.hybrid.config.cjs
    sed -i.bak 's|"tsconfig.jest.json"|"../typescript/tsconfig.jest.json"|g' config/jest/jest.hybrid.config.cjs
    echo "   ✅ Updated TypeScript references in jest.hybrid.config.cjs"
fi

echo "🔧 Updating Jest config to use new babel config path..."

# Update babel config references
if [[ -f "config/jest/jest.config.cjs" ]]; then
    sed -i.bak 's|babel.config.cjs|config/jest/babel.config.cjs|g' config/jest/jest.config.cjs
fi

if [[ -f "config/jest/jest.hybrid.config.cjs" ]]; then
    sed -i.bak 's|babel.config.cjs|config/jest/babel.config.cjs|g' config/jest/jest.hybrid.config.cjs
fi

echo "   ✅ Updated babel config references"

echo ""
echo "🔍 Verifying configuration integrity..."

# Test that configurations can be loaded
echo "   Testing Jest configuration loading..."
if node -e "require('./config/jest/jest.config.cjs')" 2>/dev/null; then
    echo "   ✅ jest.config.cjs loads successfully"
else
    echo "   ⚠️  Warning: jest.config.cjs may have issues"
fi

if node -e "require('./config/jest/jest.hybrid.config.cjs')" 2>/dev/null; then
    echo "   ✅ jest.hybrid.config.cjs loads successfully"
else
    echo "   ⚠️  Warning: jest.hybrid.config.cjs may have issues"
fi

echo ""
echo "✅ Phase 3 Complete: Active configurations organized successfully!"
echo ""
echo "📋 Summary of changes:"
echo "   • Moved Jest configs to config/jest/"
echo "   • Moved TypeScript configs to config/typescript/"
echo "   • Moved build configs to build-tools/configs/"
echo "   • Moved Docker files to build-tools/docker/"
echo "   • Updated package.json script references"
echo "   • Created backward compatibility symlinks"
echo ""
echo "🔧 Testing package integrity..."
echo "   Run the following tests to verify everything works:"
echo "   1. npm run test:hybrid"
echo "   2. npm run build"
echo "   3. Check that TypeScript compilation works"
echo ""
echo "🎯 Next Steps:"
echo "   1. Test all npm scripts to ensure they work with new config paths"
echo "   2. Update any CI/CD configurations that reference old paths"
echo "   3. When ready, execute Phase 4: ./scripts/maintenance/phase4-organize-scripts.sh"
echo ""
echo "📄 Backup: File list saved to pre-phase3-file-list.txt"
echo "📄 Package.json backup saved as package.json.bak"

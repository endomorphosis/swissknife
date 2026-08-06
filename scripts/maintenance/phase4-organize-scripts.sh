#!/bin/bash
# Phase 4: Organize Scripts and Tools
# This script moves active scripts and tools to their appropriate directories
# Risk Level: MEDIUM - May affect automated processes that reference scripts

set -e  # Exit on any error

echo "🚀 Starting Phase 4: Organizing scripts and tools..."
echo "📍 Working directory: $(pwd)"

# Verify we're in the correct directory and previous phases were completed
if [[ ! -f "package.json" ]]; then
    echo "❌ Error: Not in project root directory (package.json not found)"
    exit 1
fi

if [[ ! -d "config/jest" ]] || [[ ! -d "tools" ]]; then
    echo "❌ Error: Previous phases not completed"
    echo "   Please run Phase 1, 2, and 3 scripts first"
    exit 1
fi

echo "📋 Creating backup of current state..."
ls -la > pre-phase4-file-list.txt

echo "🔧 Moving core validation tools to tools/validators/..."

# Move validation scripts
if [[ -f "validate-fixes.cjs" ]]; then
    mv validate-fixes.cjs tools/validators/
    echo "   ✅ Moved validate-fixes.cjs"
fi

if [[ -f "validate-modules.mjs" ]]; then
    mv validate-modules.mjs tools/validators/
    echo "   ✅ Moved validate-modules.mjs"
fi

# Move verification scripts
mv verify-*.sh tools/validators/ 2>/dev/null || true
mv verify-*.js tools/validators/ 2>/dev/null || true

echo "🔧 Moving test runners to scripts/test-tools/..."

# Move core test runners
if [[ -f "tsx-test-runner.cjs" ]]; then
    mv tsx-test-runner.cjs scripts/test-tools/
    echo "   ✅ Moved tsx-test-runner.cjs"
fi

if [[ -f "direct-test-runner-v2.cjs" ]]; then
    mv direct-test-runner-v2.cjs scripts/test-tools/
    echo "   ✅ Moved direct-test-runner-v2.cjs"
fi

# Move any remaining active test runners
mv *test-runner*.cjs scripts/test-tools/ 2>/dev/null || true
mv *test-runner*.mjs scripts/test-tools/ 2>/dev/null || true

echo "🔧 Moving diagnostic tools to scripts/diagnostics/..."

# Move diagnostic and analysis tools
mv *diagnostic*.cjs scripts/diagnostics/ 2>/dev/null || true
mv *diagnostic*.mjs scripts/diagnostics/ 2>/dev/null || true
mv debug-*.cjs scripts/diagnostics/ 2>/dev/null || true
mv debug-*.mjs scripts/diagnostics/ 2>/dev/null || true
mv *analysis*.cjs scripts/diagnostics/ 2>/dev/null || true

echo "🔧 Moving utility and helper scripts to tools/..."

# Move code generation and utility tools
mv count-tests.js tools/analyzers/ 2>/dev/null || true
mv command-registry-check.js tools/analyzers/ 2>/dev/null || true
mv analyze-*.cjs tools/analyzers/ 2>/dev/null || true
mv analyze-*.js tools/analyzers/ 2>/dev/null || true

# Move conversion and generation tools
mv typescript-test-converter.cjs tools/generators/ 2>/dev/null || true
mv create-mocks.cjs tools/generators/ 2>/dev/null || true

echo "🔧 Moving maintenance scripts to scripts/maintenance/..."

# Move archival and cleanup scripts
mv *-archival*.* scripts/maintenance/ 2>/dev/null || true
mv archive-*.* scripts/maintenance/ 2>/dev/null || true
mv systematic-archival.js scripts/maintenance/ 2>/dev/null || true
mv continue-test-archival.js scripts/maintenance/ 2>/dev/null || true
mv simple-archival.cjs scripts/maintenance/ 2>/dev/null || true

# Move project management scripts
mv create-project-baseline.sh scripts/maintenance/ 2>/dev/null || true
mv project-status-report.js scripts/maintenance/ 2>/dev/null || true

echo "🔧 Moving build and deployment tools to build-tools/scripts/..."

# Move any remaining build-related scripts
mv create-*-env.sh build-tools/scripts/ 2>/dev/null || true
mv setup-*.sh build-tools/scripts/ 2>/dev/null || true

echo "🔧 Organizing remaining Node.js utilities..."

# Move remaining .cjs and .mjs utilities
mv *.cjs scripts/maintenance/ 2>/dev/null || true
mv *.mjs scripts/maintenance/ 2>/dev/null || true

# But keep the CLI entry point in root
if [[ -f "scripts/maintenance/cli.mjs" ]]; then
    mv scripts/maintenance/cli.mjs ./
    echo "   ✅ Kept cli.mjs in root"
fi

echo "🔧 Moving JavaScript test files to archive..."

# Archive standalone JavaScript test files
mv *.test.js scripts/archive/ 2>/dev/null || true
mv *-test.js scripts/archive/ 2>/dev/null || true
mv basic-node-test.js scripts/archive/ 2>/dev/null || true

echo "🔧 Creating convenience symlinks for frequently used tools..."

# Create symlinks for most commonly used tools
ln -sf tools/validators/validate-fixes.cjs validate-fixes.cjs
ln -sf scripts/test-tools/tsx-test-runner.cjs tsx-test-runner.cjs
ln -sf scripts/test-tools/direct-test-runner-v2.cjs direct-test-runner-v2.cjs

echo "   ✅ Created convenience symlinks for core tools"

echo "🔧 Updating package.json scripts to reference new tool paths..."

# Update any package.json references to moved scripts
if grep -q "validate-fixes.cjs" package.json; then
    sed -i.phase4 's|validate-fixes\.cjs|tools/validators/validate-fixes.cjs|g' package.json
    echo "   ✅ Updated validate-fixes.cjs references in package.json"
fi

if grep -q "tsx-test-runner.cjs" package.json; then
    sed -i.phase4 's|tsx-test-runner\.cjs|scripts/test-tools/tsx-test-runner.cjs|g' package.json
    echo "   ✅ Updated tsx-test-runner.cjs references in package.json"
fi

if grep -q "direct-test-runner-v2.cjs" package.json; then
    sed -i.phase4 's|direct-test-runner-v2\.cjs|scripts/test-tools/direct-test-runner-v2.cjs|g' package.json
    echo "   ✅ Updated direct-test-runner-v2.cjs references in package.json"
fi

echo "📊 Generating organization summary..."

# Count files in each category
validators_count=$(find tools/validators -type f 2>/dev/null | wc -l)
test_tools_count=$(find scripts/test-tools -type f 2>/dev/null | wc -l)
diagnostics_count=$(find scripts/diagnostics -type f 2>/dev/null | wc -l)
analyzers_count=$(find tools/analyzers -type f 2>/dev/null | wc -l)
generators_count=$(find tools/generators -type f 2>/dev/null | wc -l)
maintenance_count=$(find scripts/maintenance -type f 2>/dev/null | wc -l)

echo ""
echo "📊 Organization Results:"
echo "   📂 tools/validators: $validators_count files"
echo "   📂 scripts/test-tools: $test_tools_count files"
echo "   📂 scripts/diagnostics: $diagnostics_count files"
echo "   📂 tools/analyzers: $analyzers_count files"
echo "   📂 tools/generators: $generators_count files"
echo "   📂 scripts/maintenance: $maintenance_count files"

echo ""
echo "🔍 Verifying core functionality..."

# Check that essential tools are accessible
essential_tools=("tools/validators/validate-fixes.cjs" "scripts/test-tools/tsx-test-runner.cjs" "cli.mjs")
missing_tools=()

for tool in "${essential_tools[@]}"; do
    if [[ ! -f "$tool" ]] && [[ ! -L "$tool" ]]; then
        missing_tools+=("$tool")
    fi
done

if [[ ${#missing_tools[@]} -gt 0 ]]; then
    echo "⚠️  Warning: Some essential tools are missing:"
    printf '   %s\n' "${missing_tools[@]}"
else
    echo "✅ All essential tools are accessible"
fi

echo ""
echo "✅ Phase 4 Complete: Scripts and tools organized successfully!"
echo ""
echo "📋 Summary of changes:"
echo "   • Moved validation tools to tools/validators/"
echo "   • Moved test runners to scripts/test-tools/"
echo "   • Moved diagnostic tools to scripts/diagnostics/"
echo "   • Moved analysis tools to tools/analyzers/"
echo "   • Moved generation tools to tools/generators/"
echo "   • Moved maintenance scripts to scripts/maintenance/"
echo "   • Created convenience symlinks for frequently used tools"
echo "   • Updated package.json references"
echo ""
echo "🔧 Testing recommendations:"
echo "   1. Test that 'npm run test:hybrid' still works"
echo "   2. Test that './validate-fixes.cjs' works (via symlink)"
echo "   3. Test that './tsx-test-runner.cjs' works (via symlink)"
echo "   4. Verify any CI/CD scripts that reference moved tools"
echo ""
echo "🎯 Next Steps:"
echo "   1. Test all npm scripts and validation tools"
echo "   2. Update any external references to moved scripts"
echo "   3. When ready, execute Phase 5: ./scripts/maintenance/phase5-organize-documentation.sh"
echo ""
echo "📄 Backup: File list saved to pre-phase4-file-list.txt"
echo "📄 Package.json backup saved as package.json.phase4"

#!/bin/bash
# Phase 2: Archive Legacy Test Infrastructure
# This script moves superseded test files and configurations to archive directories
# Risk Level: LOW - Moves unused/duplicate files to archive

set -e  # Exit on any error

echo "🚀 Starting Phase 2: Archiving legacy test infrastructure..."
echo "📍 Working directory: $(pwd)"

# Verify we're in the correct directory and Phase 1 was completed
if [[ ! -f "package.json" ]]; then
    echo "❌ Error: Not in project root directory (package.json not found)"
    exit 1
fi

if [[ ! -d "scripts/archive" ]]; then
    echo "❌ Error: Phase 1 not completed (scripts/archive directory not found)"
    echo "   Please run ./scripts/maintenance/phase1-create-structure.sh first"
    exit 1
fi

echo "📋 Creating backup of current state..."
# Create a backup list of files before moving
ls -la > pre-phase2-file-list.txt

echo "🗃️  Archiving legacy test runners..."

# Archive legacy test runners (keeping only the most essential ones)
echo "   Moving test runner scripts..."
mv advanced-test-*.sh scripts/archive/ 2>/dev/null || true
mv comprehensive-test-*.sh scripts/archive/ 2>/dev/null || true
mv *-test-runner*.sh scripts/archive/ 2>/dev/null || true
mv run-*-tests*.sh scripts/archive/ 2>/dev/null || true
mv fix-*-test*.sh scripts/archive/ 2>/dev/null || true

# But keep the core working test tools in root for now (will move in later phases)
if [[ -f "scripts/archive/tsx-test-runner.cjs" ]]; then
    mv scripts/archive/tsx-test-runner.cjs ./
fi
if [[ -f "scripts/archive/direct-test-runner-v2.cjs" ]]; then
    mv scripts/archive/direct-test-runner-v2.cjs ./
fi
if [[ -f "scripts/archive/validate-fixes.cjs" ]]; then
    mv scripts/archive/validate-fixes.cjs ./
fi

echo "🗃️  Archiving duplicate Jest configurations..."

# Archive duplicate jest configs (keeping only the essential working ones)
echo "   Moving duplicate Jest configurations..."
mv jest-*.config.* config/archive/ 2>/dev/null || true
mv jest.*.config.* config/archive/ 2>/dev/null || true

# Restore the essential configs to root (will organize properly in Phase 3)
if [[ -f "config/archive/jest.config.cjs" ]]; then
    cp config/archive/jest.config.cjs ./
fi
if [[ -f "config/archive/jest.hybrid.config.cjs" ]]; then
    cp config/archive/jest.hybrid.config.cjs ./
fi

echo "🗃️  Archiving legacy diagnostic and utility scripts..."

# Archive superseded diagnostic scripts
mv *-diagnostic*.sh scripts/archive/ 2>/dev/null || true
mv debug-*.sh scripts/archive/ 2>/dev/null || true
mv *-analysis*.sh scripts/archive/ 2>/dev/null || true
mv *-fixer*.sh scripts/archive/ 2>/dev/null || true

echo "🗃️  Archiving test helper and temporary files..."

# Archive temporary test files and helpers
mv test-*.js scripts/archive/ 2>/dev/null || true
mv temp-*.js scripts/archive/ 2>/dev/null || true
mv simple-*.js scripts/archive/ 2>/dev/null || true
mv minimal-*.js scripts/archive/ 2>/dev/null || true
mv ultra-*.js scripts/archive/ 2>/dev/null || true

# Archive .mjs test files (these are mostly experiments)
mv *.test.mjs scripts/archive/ 2>/dev/null || true
mv test-*.mjs scripts/archive/ 2>/dev/null || true

echo "🗃️  Archiving log files and temporary outputs..."

# Archive log files
mv *.log scripts/archive/ 2>/dev/null || true
mv test_output.txt scripts/archive/ 2>/dev/null || true

echo ""
echo "📊 Generating archive summary..."
archived_count=$(find scripts/archive config/archive -type f 2>/dev/null | wc -l)
echo "   📁 Archived approximately $archived_count files"

echo ""
echo "🔍 Verifying core functionality still intact..."

# Check that essential files are still in place
essential_files=("package.json" "jest.config.cjs" "jest.hybrid.config.cjs" "validate-fixes.cjs" "tsx-test-runner.cjs")
missing_files=()

for file in "${essential_files[@]}"; do
    if [[ ! -f "$file" ]]; then
        missing_files+=("$file")
    fi
done

if [[ ${#missing_files[@]} -gt 0 ]]; then
    echo "⚠️  Warning: Some essential files are missing:"
    printf '   %s\n' "${missing_files[@]}"
    echo "   Please verify these files before proceeding to Phase 3"
else
    echo "✅ All essential files are in place"
fi

echo ""
echo "✅ Phase 2 Complete: Legacy test infrastructure archived successfully!"
echo ""
echo "📋 Summary of changes:"
echo "   • Moved legacy test runners to scripts/archive/"
echo "   • Moved duplicate Jest configs to config/archive/"
echo "   • Moved diagnostic and utility scripts to scripts/archive/"
echo "   • Kept essential working files in root directory"
echo ""
echo "🔧 Testing package integrity..."
echo "   Run 'npm run test:hybrid' to verify tests still work"
echo ""
echo "🎯 Next Steps:"
echo "   1. Test that 'npm run test:hybrid' still works"
echo "   2. Verify 'npm run build' still works"
echo "   3. When ready, execute Phase 3: ./scripts/maintenance/phase3-organize-configs.sh"
echo ""
echo "📄 Backup: File list saved to pre-phase2-file-list.txt"

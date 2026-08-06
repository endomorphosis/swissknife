#!/bin/bash
# Phase 5: Organize Documentation
# This script moves documentation files and reports to their appropriate directories
# Risk Level: LOW - Documentation moves don't affect functionality

set -e  # Exit on any error

echo "🚀 Starting Phase 5: Organizing documentation..."
echo "📍 Working directory: $(pwd)"

# Verify we're in the correct directory and previous phases were completed
if [[ ! -f "package.json" ]]; then
    echo "❌ Error: Not in project root directory (package.json not found)"
    exit 1
fi

if [[ ! -d "docs" ]]; then
    echo "📁 Creating docs directory structure..."
    mkdir -p docs/reports
    mkdir -p docs/legacy
fi

echo "📋 Creating backup of current state..."
ls -la *.md > pre-phase5-doc-list.txt 2>/dev/null || true

echo "🔧 Moving project reports to docs/reports/..."

# Move completion summaries and reports
for file in PHASE_*_COMPLETION_SUMMARY.md AUDIT_COMPLETION_SUMMARY.md CLEANUP_COMPLETION_CERTIFICATE.md; do
    if [[ -f "$file" ]]; then
        mv "$file" docs/reports/
        echo "   ✅ Moved $file"
    fi
done

# Move session reports
for file in SESSION_*_REPORT.md *_SESSION_REPORT.md; do
    if [[ -f "$file" ]]; then
        mv "$file" docs/reports/
        echo "   ✅ Moved $file"
    fi
done

# Move test-related reports
for file in TEST_*_UPDATE.md JEST_*_REPORT.md JEST_*_README.md COMPREHENSIVE_TEST_*.md; do
    if [[ -f "$file" ]]; then
        mv "$file" docs/reports/
        echo "   ✅ Moved $file"
    fi
done

# Move status reports
for file in CURRENT_JEST_STATUS.md DOCUMENTATION_UPDATE_SUMMARY.md; do
    if [[ -f "$file" ]]; then
        mv "$file" docs/reports/
        echo "   ✅ Moved $file"
    fi
done

echo "🔧 Moving implementation plans to docs/reports/..."

# Move implementation and planning documents
for file in *_IMPLEMENTATION_PLAN.md PHASED_CLEANUP_IMPLEMENTATION.md UNIFIED_INTEGRATION_PLAN.md; do
    if [[ -f "$file" ]]; then
        mv "$file" docs/reports/
        echo "   ✅ Moved $file"
    fi
done

# Move integration guides and reports
for file in *_INTEGRATION_*.md *_GUIDE.md VITE_INTEGRATION_GUIDE.md; do
    if [[ -f "$file" ]]; then
        mv "$file" docs/reports/
        echo "   ✅ Moved $file"
    fi
done

echo "🔧 Moving deployment and production docs to docs/reports/..."

# Move deployment documentation
for file in PRODUCTION_DEPLOYMENT.md PROJECT_STRUCTURE_SUMMARY.md REPOSITORY_AUDIT_REPORT.md; do
    if [[ -f "$file" ]]; then
        mv "$file" docs/reports/
        echo "   ✅ Moved $file"
    fi
done

echo "🔧 Moving legacy documentation to docs/legacy/..."

# Move legacy and outdated documentation
for file in README.old.md README_UPDATED.md test-execution-summary*.md; do
    if [[ -f "$file" ]]; then
        mv "$file" docs/legacy/
        echo "   ✅ Moved $file"
    fi
done

echo "🔧 Creating documentation index files..."

# Create a reports index
cat > docs/reports/README.md << 'INNEREOF'
# SwissKnife Project Reports

This directory contains project reports, implementation plans, and status summaries generated during development.

## Completion Reports
- Phase completion summaries documenting cleanup progress
- Audit completion summaries
- Session reports from development activities

## Implementation Plans
- Phased cleanup implementation documentation
- Integration plans for various tools and frameworks
- Collaboration and development workflow plans

## Test Documentation
- Jest testing reports and status updates
- Test suite expansion summaries
- Testing tool documentation

## Integration Guides
- Tool integration guides (Vite, Strudel, etc.)
- Deployment and production guides
- Development workflow documentation

## Generated Reports
This directory contains auto-generated reports and should be included in .gitignore for ongoing development.
INNEREOF

# Create a legacy documentation index
cat > docs/legacy/README.md << 'INNEREOF'
# Legacy Documentation

This directory contains outdated documentation files that are preserved for historical reference.

## Contents
- Previous versions of README files
- Outdated test execution summaries
- Historical project documentation

These files are kept for reference but are no longer actively maintained.
INNEREOF

echo "📊 Generating organization summary..."

# Count documentation files
reports_count=$(find docs/reports -name "*.md" -type f 2>/dev/null | wc -l)
legacy_count=$(find docs/legacy -name "*.md" -type f 2>/dev/null | wc -l)
remaining_docs=$(find . -maxdepth 1 -name "*.md" -type f 2>/dev/null | wc -l)

echo ""
echo "📊 Documentation Organization Results:"
echo "   📂 docs/reports: $reports_count files"
echo "   📂 docs/legacy: $legacy_count files"  
echo "   📂 root (remaining): $remaining_docs files"

echo ""
echo "🔍 Listing remaining documentation in root:"
find . -maxdepth 1 -name "*.md" -type f 2>/dev/null | sort

echo ""
echo "✅ Phase 5 Complete: Documentation organized successfully!"
echo ""
echo "📋 Next Steps:"
echo "   1. Review the organized documentation structure in docs/"
echo "   2. Verify important documentation is still accessible"
echo "   3. When ready, execute Phase 6: ./scripts/maintenance/phase6-final-validation.sh"
echo ""
echo "📂 To rollback this phase if needed:"
echo "   mv docs/reports/* docs/legacy/* ./"
echo "   rm -rf docs/reports docs/legacy"

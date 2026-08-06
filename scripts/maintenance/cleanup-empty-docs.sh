#!/bin/bash

# SwissKnife Documentation Cleanup Script
# This script removes empty documentation files identified in the repository audit

echo "🧹 Starting SwissKnife Documentation Cleanup..."
echo "This script will remove empty .md files that were identified in the audit."

# Count empty files before cleanup
EMPTY_FILES=$(find . -path "./node_modules" -prune -o -name "*.md" -type f -size 0 -print | wc -l)
echo "📊 Found $EMPTY_FILES empty documentation files to remove"

# Create backup directory
mkdir -p cleanup-backup/empty-docs
echo "💾 Creating backup in cleanup-backup/empty-docs/"

# Remove empty files from root directory
echo "🗂️ Cleaning root directory empty files..."
for file in \
    "COMPREHENSIVE_TEST_EXPANSION_SUMMARY.md" \
    "CURRENT_JEST_STATUS.md" \
    "DOCUMENTATION_UPDATE_SUMMARY.md" \
    "JEST_CONTINUATION_SESSION_REPORT.md" \
    "JEST_EXPANSION_REPORT.md" \
    "JEST_SUCCESS_REPORT.md" \
    "SESSION_COMPLETION_REPORT.md" \
    "SESSION_FINAL_REPORT.md" \
    "TEST_SUITE_STATUS_UPDATE.md" \
    "test-execution-summary-final.md" \
    "test-execution-summary-update.md" \
    "test-execution-summary.md"
do
    if [ -f "$file" ] && [ ! -s "$file" ]; then
        cp "$file" cleanup-backup/empty-docs/ 2>/dev/null
        rm "$file"
        echo "  ✅ Removed empty: $file"
    fi
done

# Remove empty files from scripts/maintenance
echo "🔧 Cleaning scripts/maintenance empty files..."
for file in \
    "scripts/maintenance/test-archival-analysis-report.md" \
    "scripts/maintenance/test-archival-strategy.md" \
    "scripts/maintenance/test-archival-final-status.md" \
    "scripts/maintenance/test-archival-progress-report.md"
do
    if [ -f "$file" ] && [ ! -s "$file" ]; then
        cp "$file" cleanup-backup/empty-docs/ 2>/dev/null
        rm "$file"
        echo "  ✅ Removed empty: $file"
    fi
done

# Remove empty files from docs/legacy
echo "📚 Cleaning docs/legacy empty files..."
for file in \
    "docs/legacy/core-testing-strategy.md" \
    "docs/legacy/phase3-implementation-report.md"
do
    if [ -f "$file" ] && [ ! -s "$file" ]; then
        cp "$file" cleanup-backup/empty-docs/ 2>/dev/null
        rm "$file"
        echo "  ✅ Removed empty: $file"
    fi
done

# Remove empty files from docs/reports
echo "📊 Cleaning docs/reports empty files..."
for file in \
    "docs/reports/PROGRESS-REPORT.md" \
    "docs/reports/TEST-STRATEGY.md" \
    "docs/reports/TEST-FIXING-SUMMARY.md" \
    "docs/reports/JEST-TEST-FIXING-UPDATE.md" \
    "docs/reports/TEST-STATUS-REPORT.md" \
    "docs/reports/TEST-REPORT.md" \
    "docs/reports/TEST-SOLUTION-README.md" \
    "docs/reports/README-TEST-FIXES.md" \
    "docs/reports/JEST-TEST-SESSION-REPORT.md" \
    "docs/reports/TYPESCRIPT-TEST-FIXES.md" \
    "docs/reports/CLEANUP_COMPLETION_REPORT.md" \
    "docs/reports/JEST-TEST-FIXING-REPORT.md" \
    "docs/reports/TEST-CLEANUP-SUMMARY.md" \
    "docs/reports/TEST-FIXES.md" \
    "docs/reports/JEST-TEST-FIXING-GUIDE.md" \
    "docs/reports/TEST-DIAGNOSTIC-REPORT.md" \
    "docs/reports/GOT-TEST-FIXES.md" \
    "docs/reports/TEST-SUMMARY.md" \
    "docs/reports/TEST-SOLUTION.md"
do
    if [ -f "$file" ] && [ ! -s "$file" ]; then
        cp "$file" cleanup-backup/empty-docs/ 2>/dev/null
        rm "$file"
        echo "  ✅ Removed empty: $file"
    fi
done

# Remove empty files from emergency-archive/documentation
echo "🚨 Cleaning emergency-archive/documentation empty files..."
find emergency-archive/documentation -name "*.md" -type f -size 0 -exec cp {} cleanup-backup/empty-docs/ \; -delete

# Count remaining empty files
REMAINING_EMPTY=$(find . -path "./node_modules" -prune -o -name "*.md" -type f -size 0 -print | wc -l)
REMOVED_COUNT=$((EMPTY_FILES - REMAINING_EMPTY))

echo ""
echo "📈 Cleanup Summary:"
echo "  📝 Empty files found: $EMPTY_FILES"
echo "  🗑️ Files removed: $REMOVED_COUNT"
echo "  📄 Files remaining: $REMAINING_EMPTY"
echo "  💾 Backups stored in: cleanup-backup/empty-docs/"
echo ""

if [ $REMAINING_EMPTY -gt 0 ]; then
    echo "⚠️ Still found $REMAINING_EMPTY empty files:"
    find . -path "./node_modules" -prune -o -name "*.md" -type f -size 0 -print
    echo ""
    echo "You may want to review these manually."
fi

echo "✅ Documentation cleanup complete!"
echo ""
echo "🔄 Next steps:"
echo "  1. Review the cleanup-backup/empty-docs/ directory"
echo "  2. Commit these changes to git"
echo "  3. Continue with other documentation updates"
echo "  4. Update documentation index files that reference removed files"
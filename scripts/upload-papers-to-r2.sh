#!/bin/bash

# Upload reformatted papers to R2 for AI Search ingestion
# This script will:
# 1. Delete the old polluted papers-2025.json from R2
# 2. Upload the new formatted papers to R2
# 3. Provide instructions for triggering AI Search sync

set -e

echo "========================================"
echo "Cloudflare R2 - Upload Papers for AI Search"
echo "========================================"
echo

# Check if wrangler is available
if ! command -v wrangler &> /dev/null; then
    echo "Error: wrangler CLI not found"
    echo "Install with: npm install -g wrangler"
    exit 1
fi

# Determine R2 bucket name from wrangler.toml
ENVIRONMENT="${1:-staging}"  # Default to staging

if [ "$ENVIRONMENT" = "staging" ]; then
    BUCKET="arxiv-papers-staging"
elif [ "$ENVIRONMENT" = "production" ]; then
    BUCKET="arxiv-papers-prod"
else
    echo "Error: Environment must be 'staging' or 'production'"
    exit 1
fi

echo "Configuration:"
echo "  Environment: $ENVIRONMENT"
echo "  R2 Bucket: $BUCKET"
echo

# Step 1: Clean old file
echo "Step 1: Deleting old papers-2025.json from R2..."
wrangler r2 object delete "$BUCKET/papers-2025.json" --remote 2>/dev/null || true
echo "  ✓ Deleted old file"
echo

# Step 2: Upload formatted papers
echo "Step 2: Uploading reformatted papers to R2..."
echo "  Uploading 100 individual JSON files..."

if [ ! -d "papers-formatted" ]; then
    echo "Error: papers-formatted directory not found"
    echo "Run: python3 scripts/reformat-for-ai-search.py"
    exit 1
fi

# Count files uploaded
UPLOADED=0

# Upload all files with a prefix to organize them
for file in papers-formatted/*.json; do
    filename=$(basename "$file")
    # Upload with a papers/ prefix to keep them organized
    wrangler r2 object put "$BUCKET/papers/$filename" --file="$file" --content-type="application/json" --remote
    UPLOADED=$((UPLOADED + 1))
    
    # Show progress every 20 files
    if [ $((UPLOADED % 20)) -eq 0 ]; then
        echo "  Uploaded $UPLOADED papers..."
    fi
done

echo "  ✓ Uploaded $UPLOADED papers to R2"
echo

# Step 3: Alternative - create a single JSONL file
echo "Step 3: Uploading JSONL file as backup..."
if [ -f "papers-2025-clean.json" ]; then
    wrangler r2 object put "$BUCKET/papers-2025-clean.jsonl" --file="papers-2025-clean.json" --content-type="application/x-ndjson" --remote
    echo "  ✓ Uploaded papers-2025-clean.jsonl"
else
    echo "  Skipped (generate with: python3 scripts/reformat-for-ai-search.py)"
fi

echo
echo "========================================"
echo "NEXT STEPS:"
echo "========================================"
echo
echo "1. Go to Cloudflare Dashboard"
echo "2. Navigate to: Compute & AI → AI Search → arxiv-papers"
echo "3. Check the configuration under 'Data Source'"
echo "4. Click 'Sync Now' or wait for automatic sync"
echo "5. Monitor the 'Index Status' for:"
echo "   - Objects: Should show 100+ (one per paper)"
echo "   - Vectors: Should show hundreds/thousands (chunked documents)"
echo
echo "This replaces the previous single wrapped JSON object"
echo "with 100 individual paper documents that AI Search can properly index."
echo

echo "Upload complete! Papers are now ready for indexing by AI Search."

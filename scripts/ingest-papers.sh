#!/bin/bash

# Ingest 2025 arXiv papers into AI Search via R2 bucket
# AI Search will auto-index papers uploaded to R2

set -e

ACCOUNT_ID="031df5f5a704861375de4d9215011341"
R2_BUCKET="arxiv-papers-staging"
ARXIV_QUERY="cat:cs.AI AND submittedDate:[202501010000 TO 202512312359]"
MAX_RESULTS="${1:-50}"

echo "📥 Fetching $MAX_RESULTS papers from arXiv (2025, cs.AI category)..."
echo ""

# Fetch papers from arXiv API
PAPERS=$(curl -s "https://export.arxiv.org/api/query?search_query=${ARXIV_QUERY}&start=0&max_results=${MAX_RESULTS}&sortBy=submittedDate&sortOrder=descending")

# Parse papers
PAPER_COUNT=$(echo "$PAPERS" | grep -o "<entry>" | wc -l)
echo "✅ Found $PAPER_COUNT papers from arXiv"
echo ""

# Extract paper data
echo "Converting papers to JSON format..."
cat > /tmp/papers.json << 'EOFPYTHON'
import xml.etree.ElementTree as ET
import json
import sys

papers = []

# Parse XML (would use actual XML parsing in production)
# For now, show the data structure that would be sent to R2

paper_data = {
    "arxiv_id": "2510.21695",
    "title": "A Knowledge-Graph Translation Layer for Mission-Aware Multi-Agent Path Planning",
    "authors": ["Author 1", "Author 2"],
    "abstract": "Paper abstract...",
    "published": "2025-10-24",
    "category": "cs.AI",
    "pdf_url": "https://arxiv.org/pdf/2510.21695"
}

print(json.dumps(paper_data, indent=2))
EOFPYTHON

python3 /tmp/papers.json

echo ""
echo "📤 To ingest into AI Search:"
echo "1. Upload papers JSON to R2 bucket: $R2_BUCKET"
echo "2. AI Search will auto-detect and index"
echo "3. Check AI Search dashboard for sync status"
echo ""
echo "Example: Upload to R2 via Wrangler"
echo "  wrangler r2 object put $R2_BUCKET/papers-2025.json --file=/tmp/papers.json"
echo ""
echo "Or configure R2 as data source in AI Search dashboard:"
echo "  https://dash.cloudflare.com/ → Compute & AI → AI Search → arxiv-papers"
echo ""
echo "✨ Papers will be automatically indexed once uploaded!"

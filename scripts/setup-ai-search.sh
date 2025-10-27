#!/bin/bash
# Setup AI Search instance via Cloudflare API
# This script automates the creation of the AI Search instance

set -e

# Configuration
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID}"
API_TOKEN="${CLOUDFLARE_API_TOKEN}"
AI_SEARCH_NAME="arxiv-papers"
DATA_SOURCE_URL="https://export.arxiv.org/api/query"

if [ -z "$ACCOUNT_ID" ] || [ -z "$API_TOKEN" ]; then
    echo "Error: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN environment variables required"
    exit 1
fi

echo "🚀 Setting up AI Search instance: $AI_SEARCH_NAME"
echo "📍 Account ID: $ACCOUNT_ID"

# Create AI Search instance
echo "📝 Creating AI Search instance..."
RESPONSE=$(curl -s -X POST \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/ai-search/indexes" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"$AI_SEARCH_NAME\",
    \"settings\": {
      \"embedding_model\": \"@hf/baai-bge-base-en-v1.5\",
      \"data_source\": \"$DATA_SOURCE_URL\"
    }
  }")

# Check if instance was created
if echo "$RESPONSE" | grep -q "\"success\":true"; then
    INSTANCE_ID=$(echo "$RESPONSE" | grep -o '"id":"[^"]*' | head -1 | cut -d'"' -f4)
    echo "✅ AI Search instance created successfully!"
    echo "📋 Instance ID: $INSTANCE_ID"
    echo "📛 Instance Name: $AI_SEARCH_NAME"
    exit 0
else
    echo "❌ Failed to create AI Search instance"
    echo "Response: $RESPONSE"
    exit 1
fi

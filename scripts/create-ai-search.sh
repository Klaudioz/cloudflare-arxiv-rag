#!/bin/bash

# Create AI Search instance via Cloudflare API
# Usage: CLOUDFLARE_API_TOKEN=xxx CLOUDFLARE_ACCOUNT_ID=yyy ./scripts/create-ai-search.sh

set -e

ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-031df5f5a704861375de4d9215011341}"
API_TOKEN="${CLOUDFLARE_API_TOKEN}"
PROJECT_NAME="arxiv-papers"
API_URL="https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai-search/projects"

if [ -z "$API_TOKEN" ]; then
  echo "Error: CLOUDFLARE_API_TOKEN not set"
  echo "Usage: CLOUDFLARE_API_TOKEN=your_token ./scripts/create-ai-search.sh"
  exit 1
fi

echo "Creating AI Search instance: $PROJECT_NAME"
echo "Account ID: $ACCOUNT_ID"
echo "API URL: $API_URL"

# Create AI Search project
RESPONSE=$(curl -s -X POST "$API_URL" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"$PROJECT_NAME\",
    \"type\": \"auto\"
  }")

echo "Response:"
echo "$RESPONSE" | jq .

# Extract project ID
PROJECT_ID=$(echo "$RESPONSE" | jq -r '.result.id // empty')

if [ -z "$PROJECT_ID" ]; then
  echo "Error: Failed to create AI Search instance"
  echo "Check your API token and account ID"
  exit 1
fi

echo ""
echo "✅ AI Search instance created successfully!"
echo "Project ID: $PROJECT_ID"
echo "Project Name: $PROJECT_NAME"
echo ""
echo "Next steps:"
echo "1. Wait 2-3 minutes for initialization"
echo "2. Deploy worker: wrangler deploy --env staging"
echo "3. Test endpoint: curl -X POST https://cloudflare-arxiv-rag-staging.klaudioz.workers.dev/api/v1/rag/ask"

#!/bin/bash

# Setup AutoRAG (AI Search) instance via official Cloudflare API
# Usage: CLOUDFLARE_API_TOKEN=xxx ./scripts/setup-autorag.sh

set -e

ACCOUNT_ID="031df5f5a704861375de4d9215011341"
RAG_NAME="arxiv-papers"
R2_BUCKET="arxiv-papers-staging"

if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  echo "❌ Error: CLOUDFLARE_API_TOKEN not set"
  echo "Usage: export CLOUDFLARE_API_TOKEN=your_token && ./scripts/setup-autorag.sh"
  exit 1
fi

echo "🚀 Setting up AutoRAG (AI Search) instance..."
echo "Account ID: $ACCOUNT_ID"
echo "RAG Name: $RAG_NAME"
echo "R2 Bucket: $R2_BUCKET"
echo ""

# Create AutoRAG instance
echo "Creating AutoRAG instance..."
RESPONSE=$(curl -s -X POST \
  "https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/autorag" \
  -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"${RAG_NAME}\",
    \"config\": {
      \"r2_bucket\": \"${R2_BUCKET}\"
    }
  }")

echo "API Response:"
echo "$RESPONSE" | jq .

SUCCESS=$(echo "$RESPONSE" | jq -r '.success // false')

if [ "$SUCCESS" = "true" ]; then
  RAG_ID=$(echo "$RESPONSE" | jq -r '.result.id')
  echo ""
  echo "✅ AutoRAG instance created!"
  echo "RAG ID: $RAG_ID"
  echo "RAG Name: $RAG_NAME"
  echo ""
  echo "Next steps:"
  echo "1. Wait 2-3 minutes for initialization"
  echo "2. Deploy worker: wrangler deploy --env staging"
  echo "3. Test endpoint:"
  echo "   curl -X POST https://cloudflare-arxiv-rag-staging.klaudioz.workers.dev/api/v1/rag/ask \\"
  echo "     -H 'Content-Type: application/json' \\"
  echo "     -d '{\"query\": \"What are transformers?\"}'"
else
  ERROR=$(echo "$RESPONSE" | jq -r '.errors[0].message // "Unknown error"')
  echo "❌ Failed to create AutoRAG: $ERROR"
  exit 1
fi

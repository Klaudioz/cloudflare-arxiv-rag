#!/bin/bash
# Complete automated deployment with AI Search setup
# Usage: ./scripts/deploy-with-ai-search.sh [staging|production]

set -e

ENV="${1:-staging}"
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID}"
API_TOKEN="${CLOUDFLARE_API_TOKEN}"
AI_SEARCH_NAME="arxiv-papers"

if [ -z "$ACCOUNT_ID" ] || [ -z "$API_TOKEN" ]; then
    echo "❌ Error: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN environment variables required"
    exit 1
fi

echo "🚀 Starting deployment to $ENV..."
echo ""

# Step 1: Build and test
echo "📍 Step 1: Building and testing..."
npm ci
npm run lint
npm run build
npm run test -- --run
echo "✅ Build and tests passed"
echo ""

# Step 2: Check/Create AI Search instance
echo "📍 Step 2: Checking AI Search instance..."
INSTANCE_CHECK=$(curl -s -X GET \
  "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/ai-search/indexes" \
  -H "Authorization: Bearer $API_TOKEN" \
  -H "Content-Type: application/json")

if echo "$INSTANCE_CHECK" | grep -q "$AI_SEARCH_NAME"; then
    echo "✅ AI Search instance '$AI_SEARCH_NAME' exists"
else
    echo "📝 Creating AI Search instance..."
    CREATE_RESPONSE=$(curl -s -X POST \
      "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/ai-search/indexes" \
      -H "Authorization: Bearer $API_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{
        \"name\": \"$AI_SEARCH_NAME\",
        \"settings\": {
          \"embedding_model\": \"@hf/baai-bge-base-en-v1.5\",
          \"auto_sync\": true,
          \"sync_interval_hours\": 24
        }
      }")
    
    if echo "$CREATE_RESPONSE" | grep -q "\"success\":true"; then
        echo "✅ AI Search instance created"
    else
        # Might already exist or be in progress
        if echo "$CREATE_RESPONSE" | grep -q "already exists\|already in use"; then
            echo "✅ AI Search instance already exists or is being set up"
        else
            echo "⚠️  AI Search setup response: $CREATE_RESPONSE"
        fi
    fi
fi
echo ""

# Step 3: Deploy
echo "📍 Step 3: Deploying to $ENV..."
npx wrangler deploy --env $ENV
echo "✅ Deployment complete"
echo ""

# Step 4: Verify
echo "📍 Step 4: Verifying deployment..."
if [ "$ENV" = "staging" ]; then
    HEALTH_URL="https://cloudflare-arxiv-rag-staging.klaudioz.workers.dev/health"
else
    HEALTH_URL="https://cloudflare-arxiv-rag-prod.klaudioz.workers.dev/health"
fi

HEALTH=$(curl -s $HEALTH_URL)
if echo "$HEALTH" | grep -q "ok"; then
    echo "✅ Health check passed"
else
    echo "⚠️  Health check failed or delayed"
fi
echo ""

echo "🎉 Deployment complete!"
echo ""
echo "📊 Deployment Summary:"
echo "  Environment: $ENV"
echo "  Health URL: $HEALTH_URL"
echo "  AI Search: $AI_SEARCH_NAME (active/creating)"
echo ""
echo "Test with:"
echo "  curl -X POST $HEALTH_URL/../api/v1/ask \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -H 'x-api-key: YOUR_API_KEY' \\"
echo "    -d '{\"query\": \"What are transformers?\", \"top_k\": 3}'"

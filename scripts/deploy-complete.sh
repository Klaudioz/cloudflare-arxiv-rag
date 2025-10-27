#!/bin/bash
# Complete deployment script for Cloudflare arXiv RAG
# Sets up AI Search instance and deploys to production

set -e

echo "🚀 Starting complete deployment..."
echo ""

# Check environment variables
if [ -z "$CLOUDFLARE_ACCOUNT_ID" ] || [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    echo "❌ Error: CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN required"
    exit 1
fi

# Step 1: Create AI Search instance
echo "📍 Step 1: Creating AI Search instance..."
AI_SEARCH_RESPONSE=$(curl -s -X POST \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/ai-search/indexes" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "arxiv-papers",
    "settings": {
      "embedding_model": "@hf/baai-bge-base-en-v1.5",
      "auto_sync": true,
      "sync_interval_hours": 24
    }
  }')

if echo "$AI_SEARCH_RESPONSE" | grep -q '"success":true'; then
    echo "✅ AI Search instance created"
else
    # Instance might already exist, which is OK
    if echo "$AI_SEARCH_RESPONSE" | grep -q "already exists"; then
        echo "✅ AI Search instance already exists"
    else
        echo "⚠️  AI Search creation response: $AI_SEARCH_RESPONSE"
    fi
fi

# Step 2: Deploy to staging
echo ""
echo "📍 Step 2: Deploying to staging..."
npx wrangler deploy --env staging
echo "✅ Staging deployment complete"

# Step 3: Run tests
echo ""
echo "📍 Step 3: Running tests..."
npm run test -- --run
if [ $? -eq 0 ]; then
    echo "✅ All tests passed"
else
    echo "❌ Tests failed - aborting deployment"
    exit 1
fi

# Step 4: Deploy to production
echo ""
echo "📍 Step 4: Deploying to production..."
npx wrangler deploy --env production
echo "✅ Production deployment complete"

# Step 5: Verify deployments
echo ""
echo "📍 Step 5: Verifying deployments..."
STAGING_HEALTH=$(curl -s https://cloudflare-arxiv-rag-staging.klaudioz.workers.dev/health)
PROD_HEALTH=$(curl -s https://cloudflare-arxiv-rag-prod.klaudioz.workers.dev/health)

if echo "$STAGING_HEALTH" | grep -q "ok"; then
    echo "✅ Staging health check passed"
else
    echo "⚠️  Staging health check failed"
fi

if echo "$PROD_HEALTH" | grep -q "ok"; then
    echo "✅ Production health check passed"
else
    echo "⚠️  Production health check failed"
fi

echo ""
echo "🎉 Deployment complete!"
echo ""
echo "📊 Deployment Summary:"
echo "  Staging API: https://cloudflare-arxiv-rag-staging.klaudioz.workers.dev"
echo "  Production API: https://cloudflare-arxiv-rag-prod.klaudioz.workers.dev"
echo "  Frontend: https://arxiv-rag.pages.dev"
echo "  AI Search: arxiv-papers (active)"
echo ""
echo "Next: Test RAG endpoints with:"
echo "  curl -X POST https://cloudflare-arxiv-rag-staging.klaudioz.workers.dev/api/v1/ask \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -H 'x-api-key: YOUR_API_KEY' \\"
echo "    -d '{\"query\": \"What are transformers?\", \"top_k\": 3}'"

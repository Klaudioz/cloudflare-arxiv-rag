# Deployment Guide

Complete guide for deploying Cloudflare arXiv RAG to staging and production environments.

## Prerequisites

1. **Cloudflare Account** with Workers enabled
2. **Node.js 18+** installed locally
3. **npm** or **yarn** package manager
4. **wrangler CLI** installed: `npm install -g wrangler`
5. **GitHub repository** for CI/CD (optional but recommended)

## Local Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Authenticate with Cloudflare

```bash
wrangler login
```

This will open a browser to authenticate and generate an API token.

### 3. Create Environment Files

Copy `.env.example` to `.env.staging` and `.env.production`:

```bash
cp .env.example .env.staging
cp .env.example .env.production
```

Update each file with environment-specific values:

```bash
# .env.staging
ENVIRONMENT=staging
AUTH_ENABLED=true
API_KEYS=sk-staging-key-1,sk-staging-key-2
RATE_LIMIT_ENABLED=true
RATE_LIMIT_PER_MINUTE=100

# .env.production
ENVIRONMENT=production
AUTH_ENABLED=true
API_KEYS=sk-prod-key-1,sk-prod-key-2
RATE_LIMIT_ENABLED=true
RATE_LIMIT_PER_MINUTE=60
```

### 4. Create AI Search Instance

Before deploying, create the AI Search instance:

```bash
wrangler ai-search create arxiv-papers
```

Note the instance ID (displayed after creation).

## Development

### Local Development Server

```bash
npm run dev
```

The server will start at `http://localhost:8787`

### Test Endpoints Locally

```bash
# Health check
curl http://localhost:8787/health

# Search (requires auth)
curl -X POST http://localhost:8787/api/v1/search \
  -H "x-api-key: sk-staging-key-1" \
  -H "Content-Type: application/json" \
  -d '{"query": "transformers", "top_k": 3}'
```

### Run Tests

```bash
# Run all tests
npm run test

# Run with coverage
npm run test:coverage

# Run with UI
npm run test:ui

# Run specific test
npm run test -- arxiv-client.test.ts
```

### Lint and Format

```bash
# Run linter
npm run lint

# Fix linting issues
npm run lint -- --fix

# Format code
npm run format
```

## Staging Deployment

### Manual Deployment

```bash
npm run build
wrangler deploy --env staging
```

The staging URL will be displayed (e.g., `https://cloudflare-arxiv-rag-staging.workers.dev`)

### Test Staging Deployment

```bash
# Health check
curl https://cloudflare-arxiv-rag-staging.workers.dev/health

# Search endpoint
curl -X POST https://cloudflare-arxiv-rag-staging.workers.dev/api/v1/search \
  -H "x-api-key: sk-staging-key-1" \
  -H "Content-Type: application/json" \
  -d '{"query": "neural networks", "top_k": 5}'

# Get daily papers
curl https://cloudflare-arxiv-rag-staging.workers.dev/api/v1/papers/daily/2024-10-27 \
  -H "x-api-key: sk-staging-key-1"
```

### View Staging Logs

```bash
wrangler tail --env staging
```

## Production Deployment

### Prerequisites for Production

1. **Custom Domain** configured in Cloudflare
2. **Production Secrets** configured in wrangler
3. **Backup Strategy** for R2 data
4. **Monitoring Setup** (Analytics Engine dashboards)

### Setup Production Secrets

```bash
# Set production API keys
wrangler secret put ADMIN_API_KEY --env production
# Paste: sk-admin-production-key

wrangler secret put JWT_SECRET --env production
# Paste: your-jwt-secret-key

# Set API keys (comma-separated)
wrangler secret put API_KEYS --env production
# Paste: sk-prod-key-1,sk-prod-key-2,sk-prod-key-3
```

### Manual Production Deployment

```bash
# Build and test first
npm run build
npm run test

# Deploy to production
wrangler deploy --env production
```

### Tag Release for Production

Production deployments are triggered by git tags:

```bash
# Create a new release tag
git tag v0.2.0
git push origin v0.2.0
```

This will trigger the GitHub Actions deploy workflow automatically.

### Verify Production Deployment

```bash
# Health check
curl https://rag.yourdomain.com/health

# Get metrics
curl https://rag.yourdomain.com/api/v1/metrics \
  -H "x-api-key: sk-prod-key-1"

# List papers
curl https://rag.yourdomain.com/api/v1/papers \
  -H "x-api-key: sk-prod-key-1"
```

## CI/CD with GitHub Actions

### Setup GitHub Secrets

Add these secrets to your GitHub repository settings:

```
CLOUDFLARE_API_TOKEN      - Wrangler API token
CLOUDFLARE_ACCOUNT_ID     - Your Cloudflare account ID
```

```bash
# Generate Wrangler token (on local machine)
wrangler secret:create CLOUDFLARE_API_TOKEN
```

### Automatic Deployment

**Staging**: Automatically deployed on push to `main` branch

**Production**: Automatically deployed when creating a git tag `v*.*.*`

### Manual GitHub Actions Trigger

You can manually trigger deployment from GitHub Actions UI:

1. Go to Actions tab
2. Select "Deploy - Staging & Production" workflow
3. Click "Run workflow"
4. Select environment (staging or production)
5. Click "Run workflow"

## Configuration Management

### Environment Variables

All configuration is loaded from environment variables:

```bash
# API Settings
ENVIRONMENT=production|staging|development
DEBUG=true|false

# AI Search
AI_SEARCH_NAME=arxiv-papers
AI_SEARCH_SYNC_INTERVAL_HOURS=6

# ArXiv
ARXIV_CATEGORY=cs.AI|cs.LG|stat.ML
ARXIV_MAX_RESULTS=100

# Rate Limiting
RATE_LIMIT_ENABLED=true|false
RATE_LIMIT_PER_MINUTE=60
RATE_LIMIT_PER_HOUR=1000

# Authentication
AUTH_ENABLED=true|false
API_KEYS=sk-key1,sk-key2,sk-key3
JWT_SECRET=your-secret
ADMIN_API_KEY=sk-admin

# Analytics
ANALYTICS_ENABLED=true|false
ANALYTICS_SAMPLE_RATE=100

# Cache
CACHE_ENABLED=true|false
CACHE_TTL_SECONDS=86400
```

## Database Setup (D1)

### Create D1 Database

```bash
wrangler d1 create arxiv-rag-db
```

### Run Migrations

```bash
# Create migration directory
mkdir migrations

# Create schema migration
cat > migrations/0001_init.sql << 'EOF'
CREATE TABLE papers (
  id INTEGER PRIMARY KEY,
  arxiv_id TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  abstract TEXT,
  authors TEXT,
  published_date TEXT,
  pdf_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_papers_arxiv_id ON papers(arxiv_id);
CREATE INDEX idx_papers_published ON papers(published_date);
EOF

# Apply migration
wrangler d1 execute arxiv-rag-db --file ./migrations/0001_init.sql
```

## R2 Storage Setup

### Create R2 Bucket

```bash
wrangler r2 bucket create arxiv-papers
```

### Configure Backup Strategy

```bash
# Copy production bucket to backup
wrangler r2 bucket create arxiv-papers-backup

# Periodic backup script (run daily)
# aws s3 sync s3://arxiv-papers s3://arxiv-papers-backup
```

## Monitoring & Observability

### View Analytics Engine Metrics

```bash
# Tail real-time metrics
wrangler tail --env production

# View specific metrics
curl https://api.cloudflare.com/client/v4/accounts/{account-id}/analytics_engine/sql \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -d "SELECT * FROM Events LIMIT 100"
```

### Error Tracking (Sentry)

```bash
# Install Sentry
npm install @sentry/cloudflare-workers

# Configure in worker.ts
import * as Sentry from "@sentry/cloudflare-workers";

Sentry.init({
  dsn: "your-sentry-dsn",
  environment: env.ENVIRONMENT,
  tracesSampleRate: 0.1
});
```

### Performance Monitoring

```bash
# Monitor core web vitals
curl https://rag.yourdomain.com/api/v1/metrics \
  -H "x-api-key: sk-prod-key-1" | jq .

# Expected response:
# {
#   "service": "cloudflare-arxiv-rag",
#   "stats": {
#     "documentsIndexed": 5234,
#     "cacheHitRate": "78.34%",
#     "lastSync": "2024-10-27T12:30:00Z"
#   }
# }
```

## Troubleshooting

### Deployment Failed

```bash
# Check build errors
npm run build

# Check lint errors
npm run lint

# Check for secret issues
wrangler secret list --env production
```

### Health Check Failing

```bash
# Check logs
wrangler tail --env production

# Verify AI Search instance
wrangler ai-search stats arxiv-papers
```

### Rate Limiting Too Strict

Adjust in `.env`:

```bash
RATE_LIMIT_PER_MINUTE=120  # Increase from 60
RATE_LIMIT_PER_HOUR=2000   # Increase from 1000
```

### Authentication Issues

```bash
# Verify API keys are set
wrangler secret list --env production

# Test with valid key
curl https://rag.yourdomain.com/health \
  -H "x-api-key: sk-prod-key-1"
```

## Rollback Procedure

### If Production Deployment Fails

```bash
# Revert to previous version
git revert HEAD
git push origin main

# Or rollback to specific commit
git reset --hard <previous-commit-hash>
git push origin main --force-with-lease

# Deploy previous version
wrangler deploy --env production
```

### Switch Traffic to Staging

```bash
# Update DNS to point to staging URL temporarily
# In Cloudflare Dashboard:
# 1. Go to DNS settings
# 2. Update CNAME to staging URL
# 3. Wait for propagation
```

## Performance Optimization

### Cache Optimization

```bash
# Increase cache TTL for stable data
CACHE_TTL_SECONDS=604800  # 1 week

# Enable query result caching
CACHE_ENABLED=true
```

### Rate Limiting Tuning

```bash
# Monitor rate limit errors
wrangler tail --env production | grep "RATE_LIMIT"

# Adjust if needed
RATE_LIMIT_PER_MINUTE=120
```

### Database Optimization

```sql
-- Analyze query performance
EXPLAIN QUERY PLAN
SELECT * FROM papers WHERE published_date > '2024-10-01';

-- Create indexes for common queries
CREATE INDEX idx_papers_published_category 
ON papers(published_date, category);
```

## Disaster Recovery

### Backup Production Data

```bash
# Export R2 data
aws s3 sync s3://arxiv-papers ./backup/

# Backup D1 database
wrangler d1 export arxiv-rag-db > backup/database.sql
```

### Restore from Backup

```bash
# Restore R2 data
aws s3 sync ./backup/ s3://arxiv-papers

# Restore D1 database
wrangler d1 execute arxiv-rag-db --file ./backup/database.sql
```

## Support & Documentation

- **Cloudflare Workers**: https://developers.cloudflare.com/workers/
- **AI Search**: https://developers.cloudflare.com/ai-search/
- **Wrangler CLI**: https://developers.cloudflare.com/workers/wrangler/
- **GitHub Actions**: https://docs.github.com/en/actions
- **Project Issues**: https://github.com/Klaudioz/cloudflare-arxiv-rag/issues

---

**Need help?** Create an issue on GitHub or check AGENTS.md for architecture details.

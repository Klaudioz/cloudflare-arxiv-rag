# Contributing to Cloudflare arXiv RAG

Thank you for your interest in contributing! This document provides guidelines and instructions for contributing.

## Getting Started

1. **Fork the repository** on GitHub
2. **Clone your fork**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/cloudflare-arxiv-rag.git
   cd cloudflare-arxiv-rag
   ```

3. **Install dependencies**:
   ```bash
   npm install
   ```

4. **Login to Cloudflare**:
   ```bash
   wrangler login
   ```

## Development Workflow

### Create a Feature Branch

```bash
git checkout -b feat/your-feature-name
# or for bug fixes:
git checkout -b fix/bug-description
```

### Make Your Changes

- Follow TypeScript best practices
- Write clear, descriptive commit messages
- Keep commits atomic and focused

### Format and Lint

```bash
# Format code
npm run format

# Run linter
npm run lint
```

### Test Locally

```bash
# Start local development server
npm run dev

# Test your changes
curl http://localhost:8787/api/v1/health
```

## Commit Guidelines

Follow conventional commit format:

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- `feat`: A new feature
- `fix`: A bug fix
- `docs`: Documentation only changes
- `style`: Changes that don't affect meaning (formatting, etc)
- `refactor`: Code change that neither fixes a bug nor adds a feature
- `perf`: Code change that improves performance
- `test`: Adding or updating tests
- `chore`: Changes to build process or dependencies

### Examples

```
feat(search): Add metadata filtering support

- Implement folder-based multi-tenancy
- Add query parameter validation
- Update types for filter options

Closes #42
```

```
fix(api): Correct error handling in RAG endpoint

Fix timeout issues when AI Search takes longer than expected
```

## Submitting Changes

1. **Push to your branch**:
   ```bash
   git push origin feat/your-feature-name
   ```

2. **Create a Pull Request** on GitHub with:
   - Clear description of changes
   - Reference any related issues (#issue_number)
   - Screenshots/examples if applicable

3. **Address review feedback**:
   - Make requested changes
   - Push updates to your branch
   - Don't force push unless asked

## Pull Request Guidelines

- Keep PRs focused and reasonably sized
- Update documentation if needed
- Test your changes thoroughly
- Ensure all CI checks pass

## Code Style

- Use 2-space indentation
- Use single quotes in TypeScript
- Max line length: 100 characters
- Use arrow functions where appropriate
- Add JSDoc comments for public APIs

### Example

```typescript
/**
 * Search papers using AI Search
 * 
 * @param query - The search query
 * @param maxResults - Maximum results to return (1-50)
 * @returns Array of matching papers
 */
async function searchPapers(query: string, maxResults: number = 10): Promise<SearchResult[]> {
  // Implementation
}
```

## Testing

Currently, tests are in the planning phase. When test infrastructure is added:

```bash
npm run test
```

## Reporting Issues

When reporting bugs, include:

- Description of the issue
- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment (OS, Node version, etc.)

### Good Issue Example

```
**Description**: RAG endpoint returns 500 error for queries with special characters

**Steps to Reproduce**:
1. Send POST to /api/v1/ask with query: "What is C++"
2. Observe error response

**Expected**: Should return valid RAG response
**Actual**: Returns HTTP 500 with error message

**Environment**: macOS 14.2, Node 20.9.0
```

## Documentation

- Update README.md for user-facing changes
- Update AGENTS.md for architecture/implementation changes
- Add JSDoc comments to new functions
- Keep comments accurate and helpful

## Questions?

- Check existing issues and discussions
- Ask in a new issue with the `question` label
- Reach out to maintainers

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

**Thank you for contributing!** 🚀

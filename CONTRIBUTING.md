# Contributing to Normsar-DO

Thank you for your interest in contributing! This guide will help you get started.

## Code of Conduct

Please be respectful and constructive in all interactions with other contributors and users.

## Getting Started

### Prerequisites
- Node.js 18+
- npm, yarn, or pnpm
- Cloudflare account
- Git

### Development Setup

```bash
# Clone the repository
git clone https://github.com/sengtha/Normsar-DO.git
cd Normsar-DO

# Install dependencies
npm install

# Copy environment template
cp .env.example .env.local

# Add your local secrets
npm run dev:secret DO_SECRET_KEY "$(openssl rand -hex 32)"
npm run dev:secret SUPABASE_URL "https://your-project.supabase.co"
npm run dev:secret SUPABASE_PUBLISHABLE_KEY "your_key"

# Start development server
npm run dev
```

## Making Changes

### 1. Create a Feature Branch
```bash
git checkout -b feature/your-feature-name
# or
git checkout -b fix/your-bug-fix
```

### 2. Make Your Changes
- Keep commits atomic and descriptive
- Follow the existing code style
- Write clear commit messages

### 3. Test Your Changes
```bash
npm run dev          # Local testing
npm test             # Run tests
npm run build        # Verify build
npm run lint         # Check linting
```

### 4. Commit & Push
```bash
git add .
git commit -m "feat: add new feature" 
# or
git commit -m "fix: resolve issue with X"
git push origin feature/your-feature-name
```

### 5. Create a Pull Request
- Use a clear title describing the change
- Link any related issues
- Describe the motivation and implementation
- Request review from maintainers

## Commit Message Convention

Use conventional commits:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation
- `style:` - Code style changes (no logic change)
- `refactor:` - Code refactoring (no feature/bug change)
- `test:` - Adding or updating tests
- `chore:` - Build, dependencies, etc.

Example:
```
feat: add rate limiting to WebSocket connections

- Implement per-user message rate limiting
- Add configurable limits via environment variables
- Prevent spam and abuse on high-traffic rooms
```

## Pull Request Process

1. **Update README.md** if adding features or changing API
2. **Add tests** for new functionality
3. **Update SECURITY.md** if affecting security
4. **Ensure all tests pass**: `npm test`
5. **Verify build works**: `npm run build`

### PR Checklist
- [ ] Code follows style guide
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] No breaking changes (or clearly marked)
- [ ] Security review completed (if applicable)
- [ ] All tests passing

## Reporting Issues

### Security Issues
**Do not** open public issues for security vulnerabilities.
See [SECURITY.md](./SECURITY.md) for reporting instructions.

### Bugs
Include:
- Clear description of the issue
- Steps to reproduce
- Expected behavior
- Actual behavior
- Environment (OS, Node version, etc.)
- Error logs or stack traces

### Feature Requests
Include:
- Clear description of the feature
- Use case and motivation
- Example usage
- Any implementation ideas

## Code Style

### TypeScript
- Use strict mode
- Add type annotations for function parameters and return types
- Use meaningful variable names
- Comment complex logic

### Formatting
- Indentation: 2 spaces
- Line length: 100 characters (soft limit)
- Use semicolons
- Use const/let, avoid var

### Example
```typescript
async function verifySupabaseJWT(
  token: string,
  env: Env
): Promise<VerifiedToken> {
  try {
    const JWKS = getJWKS(env.SUPABASE_URL);
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: `${env.SUPABASE_URL}/auth/v1`,
      audience: "authenticated",
    });
    return { valid: true, payload };
  } catch (error) {
    // Handle error appropriately
    return { valid: false, reason: error?.message };
  }
}
```

## Testing

Write tests for:
- New functions
- Bug fixes (to prevent regression)
- Security-related changes

Run tests with:
```bash
npm test
```

## Documentation

Update documentation for:
- New features
- API changes
- Configuration options
- Breaking changes

## Performance Considerations

Before submitting, consider:
- Impact on connection latency
- Memory usage at scale
- CPU usage under load
- Cold start time
- Cache effectiveness

## Areas We Need Help With

- [ ] Better error handling and messages
- [ ] Performance optimizations
- [ ] Security audits
- [ ] Documentation improvements
- [ ] Example applications
- [ ] Integration examples

## Questions?

- 📖 Check existing [issues](https://github.com/sengtha/Normsar-DO/issues)
- 💬 Start a [discussion](https://github.com/sengtha/Normsar-DO/discussions)
- 📧 Email: [sengtha@gmail.com](mailto:sengtha@gmail.com)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Normsar-DO! 🚀

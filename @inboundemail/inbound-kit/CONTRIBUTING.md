# Contributing to Inbound Kit

Thank you for your interest in contributing to Inbound Kit! This document provides guidelines and information for contributors.

## 🚀 Getting Started

### Prerequisites

- **Node.js** 16+ or **Bun** (recommended)
- **Git** for version control
- **Inbound Email account** with API access for testing

### Development Environment Setup

1. **Fork and clone the repository**:
   ```bash
   git clone https://github.com/YOUR_USERNAME/sdk.git
   cd sdk/@inboundemail/inbound-kit
   ```

2. **Install dependencies**:
   ```bash
   bun install
   ```

3. **Set up environment**:
   ```bash
   # Copy example environment file
   cp .env.example .env
   
   # Add your test API key
   echo 'INBOUND_API_KEY=your-test-api-key' >> .env
   ```

4. **Build and link locally**:
   ```bash
   bun run build
   bun link
   ```

5. **Verify installation**:
   ```bash
   inbound-kit --version
   inbound-kit --help
   ```

## 🛠️ Development Workflow

### Making Changes

1. **Create a feature branch**:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the coding guidelines below

3. **Test your changes**:
   ```bash
   # Build and test
   bun run build
   bun run type-check
   bun run lint
   
   # Test CLI functionality
   cd ../test-directory
   inbound-kit init
   inbound-kit status
   ```

4. **Commit your changes**:
   ```bash
   git add .
   git commit -m "feat: add new feature description"
   ```

5. **Push and create PR**:
   ```bash
   git push origin feature/your-feature-name
   ```

### Testing

#### Unit Testing
```bash
bun test                    # Run all tests
bun test --watch           # Watch mode
bun test specific.test.ts  # Run specific test
```

#### Integration Testing
```bash
# Test with real API (requires valid API key)
cd test-directory
inbound-kit init --force
inbound-kit status --verbose
inbound-kit diff
inbound-kit push --dry-run
```

#### Manual Testing Checklist
- [ ] CLI installs and runs correctly
- [ ] All commands show proper help text
- [ ] Configuration loading works for TS/JS/JSON
- [ ] Authentication works with .env file
- [ ] Error messages are clear and helpful
- [ ] Verbose mode provides useful debugging info

## 📝 Coding Guidelines

### TypeScript

- **Strict mode**: All code must pass TypeScript strict mode
- **Types**: Use explicit types, avoid `any` where possible
- **Interfaces**: Prefer interfaces over type aliases for objects
- **Exports**: Use explicit exports, avoid `export *`

### Code Style

- **ESLint**: Follow the configured ESLint rules
- **Naming**: Use descriptive names for functions and variables
- **Comments**: Add JSDoc comments for public APIs
- **Error handling**: Provide clear, actionable error messages

### File Organization

```
src/
├── types.ts              # All TypeScript type definitions
├── auth.ts               # Authentication logic only
├── config.ts             # Configuration file handling
├── state.ts              # API state management
├── cli.ts                # CLI entry point and command setup
├── index.ts              # Package exports
└── commands/             # Individual command implementations
    ├── init.ts
    ├── push.ts
    ├── pull.ts
    ├── diff.ts
    └── status.ts
```

### Error Handling

- **User-friendly messages**: Errors should be clear and actionable
- **Exit codes**: Use appropriate exit codes (0 = success, 1 = error)
- **Verbose mode**: Provide detailed debugging info when `--verbose` is used
- **Graceful degradation**: Handle network issues and API errors gracefully

Example error handling:
```typescript
try {
  const result = await client.domain.list()
  if (result.error) {
    console.error(chalk.red('❌ API Error:'), result.error)
    process.exit(1)
  }
} catch (error) {
  console.error(chalk.red('❌ Network Error:'), error instanceof Error ? error.message : 'Unknown error')
  if (options.verbose) {
    console.error(chalk.gray('Stack trace:'), error)
  }
  process.exit(1)
}
```

## 🎯 Contribution Areas

### High Priority

1. **Test Coverage** - Add comprehensive tests for all commands
2. **Error Handling** - Improve error messages and recovery
3. **Performance** - Optimize API calls and state management
4. **Documentation** - Improve examples and use cases

### New Features

1. **Configuration Validation** - Add `validate` command
2. **Backup/Restore** - Add `backup` and `restore` commands  
3. **Environment Management** - Support multiple environments
4. **Webhooks Testing** - Add `test` command for webhook endpoints
5. **Configuration Templates** - Pre-built templates for common setups

### Integrations

1. **More Webhook Services** - Teams, Telegram, custom services
2. **CI/CD Integration** - GitHub Actions, GitLab CI examples
3. **Monitoring** - Health checks and status monitoring
4. **Import/Export** - Support for other email service configs

## 🔍 Code Review Process

### What We Look For

1. **Functionality** - Does the code work as intended?
2. **Code Quality** - Is it readable, maintainable, and well-structured?
3. **Testing** - Are there appropriate tests and have they been run?
4. **Documentation** - Are changes documented and examples provided?
5. **Compatibility** - Does it work across different environments?

### Review Checklist

- [ ] Code follows TypeScript and ESLint guidelines
- [ ] All tests pass (`bun run test`)
- [ ] Type checking passes (`bun run type-check`)
- [ ] Linting passes (`bun run lint`)
- [ ] CLI commands work as expected
- [ ] Error handling is appropriate
- [ ] Documentation is updated
- [ ] Examples are provided for new features

## 🐛 Bug Reports

When reporting bugs, please include:

1. **Environment information**:
   - Operating system
   - Node.js/Bun version
   - Inbound Kit version
   - Configuration format used

2. **Steps to reproduce**:
   - Exact commands run
   - Configuration file content (sanitized)
   - Expected vs actual behavior

3. **Error output**:
   - Full error messages
   - Stack traces (if available)
   - Verbose output (`--verbose` flag)

4. **Additional context**:
   - API responses (sanitized)
   - Network conditions
   - Related issues or workarounds

## 💡 Feature Requests

When requesting features, please include:

1. **Use case**: What problem does this solve?
2. **Proposed solution**: How should it work?
3. **Alternatives**: What workarounds exist currently?
4. **Examples**: Provide concrete examples of usage

## 🔒 Security

### Reporting Security Issues

**DO NOT** create public issues for security vulnerabilities. Instead:

1. Email security@inbound.new with details
2. Include steps to reproduce
3. Provide your contact information
4. Allow reasonable time for response

### Security Guidelines

- Never commit API keys or sensitive data
- Sanitize all example configurations
- Use environment variables for authentication
- Validate all user inputs
- Handle API responses securely

## 📚 Documentation

### Writing Documentation

- **Clear and concise**: Explain concepts simply
- **Examples**: Provide working code examples
- **Screenshots**: Include CLI output examples
- **Cross-references**: Link to related documentation

### Documentation Types

1. **README.md** - Overview and quick start
2. **API Documentation** - JSDoc comments in code
3. **Examples** - Working configuration examples
4. **Guides** - Step-by-step tutorials

## 🎉 Recognition

Contributors will be:
- Listed in the project README
- Mentioned in release notes
- Credited in documentation they help create

## 📞 Getting Help

- **Questions**: Use [GitHub Discussions](https://github.com/inboundemail/sdk/discussions)
- **Bugs**: Create [GitHub Issues](https://github.com/inboundemail/sdk/issues)
- **Chat**: Join our community Discord (link in main README)
- **Email**: Reach out to support@inbound.new for complex questions

## 🏆 Contributor Levels

### First-time Contributors
- Documentation improvements
- Bug fixes
- Example configurations
- Test coverage improvements

### Regular Contributors  
- New CLI commands
- New endpoint types
- Performance optimizations
- Advanced features

### Core Contributors
- Architecture decisions
- Release management
- Security reviews
- Mentoring new contributors

Thank you for helping make Inbound Kit better! 🙌

# Development Guide

This guide covers the development workflow, architecture, and testing strategies for Inbound Kit.

## 🏗️ Architecture Overview

Inbound Kit follows a modular architecture with clear separation of concerns:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   CLI Commands  │────│  State Manager  │────│  Inbound API    │
│                 │    │                 │    │                 │
│ • init          │    │ • fetchState    │    │ • SDK Client    │
│ • push          │    │ • calculateDiff │    │ • API Calls     │
│ • pull          │    │ • applyChanges  │    │ • Error Handling│
│ • diff          │    │                 │    │                 │
│ • status        │    │                 │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │
         │              ┌─────────────────┐
         │              │ Config Loader   │
         │              │                 │
         └──────────────│ • TypeScript    │
                        │ • JavaScript    │
                        │ • JSON          │
                        │ • Validation    │
                        └─────────────────┘
```

### Core Components

#### 1. **CLI Layer** (`src/cli.ts`, `src/commands/`)
- Command-line interface using Commander.js
- User interaction and confirmation prompts
- Output formatting and colors
- Error handling and help text

#### 2. **Configuration Layer** (`src/config.ts`)
- Multi-format config file loading (TS/JS/JSON)
- Configuration validation and normalization
- Shorthand syntax expansion
- Example generation

#### 3. **State Management** (`src/state.ts`)
- API state fetching and caching
- Diff calculation between desired and current state
- Change application with rollback support
- Endpoint matching and reuse logic

#### 4. **Authentication** (`src/auth.ts`)
- Environment variable loading
- API key validation
- SDK client creation
- Authentication testing

## 🔧 Development Commands

```bash
# Development
bun run dev                # Watch mode compilation
bun run build             # Production build
bun run type-check        # TypeScript validation
bun run lint              # ESLint checking
bun run lint:fix          # Auto-fix ESLint issues

# Testing
bun test                  # Run unit tests
bun test --watch          # Watch mode testing
bun run test:integration  # Integration tests (if implemented)

# CLI Testing
bun run cli -- init      # Test CLI commands directly
bun run cli -- status --verbose
```

## 🧪 Testing Strategy

### Unit Tests
- **Configuration parsing**: Test all config formats and validation
- **Endpoint normalization**: Test shorthand expansion
- **State diffing**: Test change calculation logic
- **Authentication**: Test API key loading and validation

### Integration Tests
- **End-to-end workflows**: Test complete push/pull cycles
- **API integration**: Test with real Inbound API
- **Error scenarios**: Test network failures and API errors
- **Configuration variations**: Test complex configuration scenarios

### Manual Testing

Create a test project to verify CLI functionality:

```bash
# Set up test environment
mkdir inbound-kit-test && cd inbound-kit-test
echo 'INBOUND_API_KEY=your-test-key' > .env

# Test initialization
inbound-kit init

# Edit configuration
cat > inbound.config.ts << 'EOF'
export default {
  emailAddresses: {
    "test@yourdomain.com": "https://webhook.site/unique-id"
  }
}
EOF

# Test workflow
inbound-kit status
inbound-kit diff
inbound-kit push --dry-run
inbound-kit push
```

## 🔄 State Management Deep Dive

### State Synchronization Flow

1. **Fetch Current State**:
   ```typescript
   const currentState = await fetchCurrentState(client)
   // Fetches domains, email addresses, and endpoints from API
   ```

2. **Calculate Differences**:
   ```typescript
   const diff = calculateDiff(config, currentState)
   // Compares desired config with current state
   // Returns list of changes needed
   ```

3. **Apply Changes**:
   ```typescript
   await applyChanges(client, diff.changes, currentState)
   // Creates, updates, or deletes resources via API
   ```

### Change Types

- **CREATE**: Resource exists in config but not in API
- **UPDATE**: Resource exists but configuration differs
- **DELETE**: Resource exists in API but not in config

### Endpoint Matching Logic

The CLI intelligently reuses existing endpoints:

```typescript
// If webhook URL matches existing endpoint, reuse it
const existingEndpoint = findMatchingEndpoint(desiredConfig, currentEndpoints)
if (existingEndpoint) {
  return existingEndpoint.id
} else {
  return await createNewEndpoint(desiredConfig)
}
```

## 📊 Configuration Schema

### Shorthand Syntax Support

```typescript
// Simple webhook
"hello@example.com": "https://api.example.com/webhook"

// Email forwarding  
"sales@example.com": { forward: "crm@company.com" }

// Email group
"support@example.com": ["admin@company.com", "dev@company.com"]

// Slack integration
"alerts@example.com": { 
  slack: "https://hooks.slack.com/webhook" 
}

// Discord integration
"notifications@example.com": { 
  discord: {
    url: "https://discord.com/webhook",
    username: "Bot"
  }
}
```

### Full Configuration Schema

```typescript
interface InboundConfig {
  emailAddresses: Record<string, EndpointShorthand>
  domains?: Record<string, DomainConfig>
  endpoints?: Record<string, EndpointConfig>
}
```

## 🚨 Error Handling Patterns

### Validation Errors
- Configuration file syntax errors
- Invalid email addresses or URLs
- Missing required fields
- Type mismatches

### API Errors
- Authentication failures
- Network connectivity issues
- Rate limiting
- Resource not found
- Permission denied

### Recovery Strategies
- Graceful degradation for non-critical errors
- Detailed error messages with suggestions
- Rollback support for failed operations
- Retry logic for transient failures

## 📈 Performance Considerations

### API Optimization
- Batch API calls where possible
- Cache API responses during single operation
- Use pagination for large datasets
- Implement request timeout handling

### Memory Management
- Stream large configuration files
- Clean up temporary resources
- Avoid loading entire state into memory unnecessarily

### User Experience
- Show progress indicators for long operations
- Provide ETA for large state syncs
- Allow cancellation of long-running operations

## 🔐 Security Best Practices

### API Key Handling
- Never log API keys
- Use environment variables only
- Validate API key format
- Clear API keys from memory after use

### Configuration Security
- Sanitize configuration before logging
- Validate all user inputs
- Prevent code injection in dynamic imports
- Handle file system operations securely

### Network Security
- Use HTTPS for all API calls
- Validate SSL certificates
- Implement request timeouts
- Handle network errors gracefully

## 🚀 Release Process

### Version Management
- Follow semantic versioning (SemVer)
- Update version in `package.json` and constants
- Create detailed release notes
- Tag releases in Git

### Pre-release Checklist
- [ ] All tests pass
- [ ] Documentation is updated
- [ ] Examples work with new version
- [ ] Breaking changes are documented
- [ ] Migration guide is provided (if needed)

### Release Steps
1. Create release branch
2. Update version numbers
3. Update CHANGELOG.md
4. Test with real API
5. Create PR for review
6. Merge and tag release
7. Publish to npm
8. Update documentation

## 🤝 Community Guidelines

### Code of Conduct
- Be respectful and inclusive
- Provide constructive feedback
- Help newcomers learn
- Share knowledge and best practices

### Communication
- Use clear, descriptive commit messages
- Provide context in PR descriptions
- Respond to feedback promptly
- Ask questions when unsure

### Collaboration
- Review others' PRs when possible
- Share testing results
- Document lessons learned
- Contribute to discussions

## 📝 Commit Message Guidelines

Use conventional commit format:

```
type(scope): description

[optional body]

[optional footer]
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Examples:
```
feat(cli): add validate command for configuration files
fix(auth): handle missing .env file gracefully
docs(readme): add troubleshooting section
test(config): add tests for endpoint normalization
```

## 🔍 Debugging Tips

### Common Issues

1. **Module Import Errors**:
   ```bash
   # Ensure proper build
   bun run build
   
   # Check file extensions in imports
   # Use .js extensions in TypeScript files for ESM
   ```

2. **API Authentication**:
   ```bash
   # Test API key manually
   curl -H "Authorization: Bearer $INBOUND_API_KEY" \
        https://inbound.new/api/v2/domains
   ```

3. **Configuration Loading**:
   ```bash
   # Test config file syntax
   node -e "console.log(require('./inbound.config.js'))"
   
   # Test TypeScript compilation
   npx tsc --noEmit inbound.config.ts
   ```

### Debug Mode

Enable debug logging:
```bash
DEBUG=inbound-kit:* inbound-kit status
```

Add debug statements:
```typescript
import debug from 'debug'
const log = debug('inbound-kit:state')

log('Fetching current state...')
```

Happy coding! 🎉

# @inboundemail/inbound-kit

Infrastructure as Code CLI for Inbound Email. Manage your email addresses, endpoints, and domains declaratively using configuration files - just like Drizzle Kit for databases.

[![npm version](https://badge.fury.io/js/@inboundemail%2Finbound-kit.svg)](https://www.npmjs.com/package/@inboundemail/inbound-kit)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ Features

- 🏗️ **Infrastructure as Code** - Define email routing in version-controlled config files
- 🔄 **Sync Management** - Push/pull configuration between code and Inbound API
- 🎯 **Multiple Endpoint Types** - Webhooks, email forwarding, Slack, Discord, email groups
- 📝 **TypeScript Support** - Full type safety with excellent IntelliSense
- 🚀 **Simple Workflow** - Familiar `init`, `diff`, `push`, `pull` commands
- 🔐 **Secure Authentication** - Environment-based API key management

## 🚀 Quick Start

### Installation

```bash
# Install globally
npm install -g @inboundemail/inbound-kit
# or with bun
bun install -g @inboundemail/inbound-kit

# Or install locally in your project
npm install --save-dev @inboundemail/inbound-kit
bun add --dev @inboundemail/inbound-kit
```

## Quick Start

1. **Initialize configuration**:
   ```bash
   inbound-kit init
   ```

2. **Configure your email infrastructure** in `inbound.config.ts`:
   ```typescript
   export default {
     emailAddresses: {
       "hello@yourdomain.com": "https://api.yourdomain.com/webhook",
       "support@yourdomain.com": ["admin@company.com", "dev@company.com"],
       "sales@yourdomain.com": { forward: "crm@company.com" }
     }
   }
   ```

3. **Set up authentication** in `.env`:
   ```bash
   INBOUND_API_KEY=your-api-key-here
   ```

4. **Apply your configuration**:
   ```bash
   inbound-kit push
   ```

## Commands

### `inbound-kit init`
Initialize a new configuration file with examples and prompts.

```bash
inbound-kit init                    # Interactive setup
inbound-kit init --force            # Overwrite existing config
```

### `inbound-kit status`
Show current state of your Inbound resources.

```bash
inbound-kit status                  # Show overview
inbound-kit status --verbose        # Show detailed information
```

### `inbound-kit diff`
Show differences between your configuration and current state.

```bash
inbound-kit diff                    # Show pending changes
inbound-kit diff --verbose          # Show detailed diffs
```

### `inbound-kit push`
Apply your configuration to Inbound (create/update/delete resources).

```bash
inbound-kit push                    # Apply with confirmation
inbound-kit push --force            # Apply without confirmation
inbound-kit push --dry-run          # Preview changes only
```

### `inbound-kit pull`
Generate configuration from your current Inbound state.

```bash
inbound-kit pull                    # Interactive format selection
inbound-kit pull --force            # Overwrite existing config
inbound-kit pull --dry-run          # Preview generated config
```

## Configuration

### Email Addresses

Define email addresses and their routing in the `emailAddresses` object:

```typescript
export default {
  emailAddresses: {
    // Simple webhook
    "hello@example.com": "https://api.example.com/webhook",
    
    // Email forwarding
    "sales@example.com": { forward: "crm@company.com" },
    
    // Email group (multiple recipients)
    "support@example.com": ["admin@company.com", "dev@company.com", "support@company.com"],
    
    // Slack integration
    "alerts@example.com": {
      slack: {
        url: "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK",
        channel: "#alerts",
        username: "Inbound Bot"
      }
    },
    
    // Discord integration
    "notifications@example.com": {
      discord: {
        url: "https://discord.com/api/webhooks/YOUR/DISCORD/WEBHOOK",
        username: "Inbound Bot"
      }
    }
  }
}
```

### Domains

Configure domain-level settings like catch-all routing:

```typescript
export default {
  emailAddresses: { /* ... */ },
  domains: {
    "example.com": {
      catchAll: "https://api.example.com/catchall" // Route all unmatched emails
    },
    "anotherdomain.com": {
      catchAll: false // Disable catch-all
    }
  }
}
```

### Advanced Endpoints

Define reusable endpoint configurations:

```typescript
export default {
  emailAddresses: {
    "hello@example.com": "primary-webhook",
    "support@example.com": "support-team"
  },
  endpoints: {
    "primary-webhook": {
      type: "webhook",
      url: "https://api.example.com/inbound",
      timeout: 30,
      retryAttempts: 3,
      headers: {
        "X-API-Key": "your-api-key",
        "X-Source": "inbound-email"
      }
    },
    "support-team": {
      type: "email_group",
      emails: ["admin@company.com", "dev@company.com"]
    }
  }
}
```

## Endpoint Types

### Webhook
```typescript
"hello@example.com": "https://api.example.com/webhook"
// or
"hello@example.com": {
  type: "webhook",
  url: "https://api.example.com/webhook",
  timeout: 30,
  retryAttempts: 3,
  headers: { "X-API-Key": "secret" }
}
```

### Email Forwarding
```typescript
"sales@example.com": { forward: "crm@company.com" }
```

### Email Group
```typescript
"support@example.com": ["admin@company.com", "dev@company.com"]
```

### Slack Integration
```typescript
"alerts@example.com": {
  slack: "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK"
}
// or
"alerts@example.com": {
  slack: {
    url: "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK",
    channel: "#alerts",
    username: "Inbound Bot"
  }
}
```

### Discord Integration
```typescript
"notifications@example.com": {
  discord: "https://discord.com/api/webhooks/YOUR/DISCORD/WEBHOOK"
}
// or
"notifications@example.com": {
  discord: {
    url: "https://discord.com/api/webhooks/YOUR/DISCORD/WEBHOOK",
    username: "Inbound Bot",
    avatarUrl: "https://example.com/avatar.png"
  }
}
```

## Authentication

Inbound Kit looks for your API key in the following order:

1. `--api-key` CLI option
2. `INBOUND_API_KEY` in `.env` file
3. `INBOUND_API_KEY` environment variable

### Example `.env` file:
```bash
INBOUND_API_KEY=your-api-key-here
INBOUND_BASE_URL=https://inbound.new/api/v2  # Optional, defaults to production
```

## Configuration Files

Inbound Kit supports multiple configuration formats:

- `inbound.config.ts` (TypeScript)
- `inbound.config.js` (JavaScript)
- `inbound.config.mjs` (ES Modules)
- `inbound.config.json` (JSON)

## CLI Options

### Global Options
- `-c, --config <path>` - Path to configuration file
- `-k, --api-key <key>` - Inbound API key (overrides .env)
- `-u, --base-url <url>` - API base URL
- `-v, --verbose` - Enable verbose output

### Command-Specific Options
- `--force` - Skip confirmations (push, pull, init)
- `--dry-run` - Preview changes without applying (push, pull)

## Workflow

### Initial Setup
```bash
# 1. Initialize configuration
inbound-kit init

# 2. Edit inbound.config.ts with your email addresses
# 3. Set up .env file with your API key

# 4. Check current status
inbound-kit status

# 5. See what changes would be made
inbound-kit diff

# 6. Apply configuration
inbound-kit push
```

### Making Changes
```bash
# 1. Edit inbound.config.ts
# 2. Preview changes
inbound-kit diff

# 3. Apply changes
inbound-kit push
```

### Syncing from Inbound
```bash
# Generate config from current Inbound state
inbound-kit pull
```

## Examples

### Simple Webhook Setup
```typescript
// inbound.config.ts
export default {
  emailAddresses: {
    "hello@yourdomain.com": "https://api.yourdomain.com/inbound",
    "contact@yourdomain.com": "https://api.yourdomain.com/contact"
  }
}
```

### Team Email Routing
```typescript
// inbound.config.ts
export default {
  emailAddresses: {
    "support@company.com": ["john@company.com", "jane@company.com"],
    "sales@company.com": { forward: "crm@company.com" },
    "alerts@company.com": {
      slack: {
        url: "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK",
        channel: "#alerts"
      }
    }
  },
  domains: {
    "company.com": {
      catchAll: "https://api.company.com/catchall"
    }
  }
}
```

### Advanced Configuration
```typescript
// inbound.config.ts
export default {
  emailAddresses: {
    "api@example.com": "primary-webhook",
    "support@example.com": "support-team",
    "alerts@example.com": "slack-alerts"
  },
  endpoints: {
    "primary-webhook": {
      type: "webhook",
      url: "https://api.example.com/inbound",
      timeout: 45,
      retryAttempts: 5,
      headers: {
        "X-API-Key": "your-secret-key",
        "X-Source": "inbound-email"
      }
    },
    "support-team": {
      type: "email_group", 
      emails: ["admin@company.com", "support@company.com"]
    },
    "slack-alerts": {
      type: "slack",
      webhookUrl: "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK",
      channel: "#alerts",
      username: "Inbound Bot"
    }
  },
  domains: {
    "example.com": {
      catchAll: "primary-webhook"
    }
  }
}
```

## TypeScript Support

Inbound Kit is built with TypeScript and provides full type safety:

```typescript
import type { InboundConfig } from '@inboundemail/inbound-kit'

const config: InboundConfig = {
  emailAddresses: {
    "hello@example.com": "https://api.example.com/webhook"
  }
}

export default config
```

## Error Handling

Inbound Kit provides detailed error messages and suggestions:

- **Authentication errors**: Clear guidance on setting up API keys
- **Configuration errors**: Validation with specific error locations
- **API errors**: Detailed error messages from the Inbound API
- **Network errors**: Helpful troubleshooting information

## Integration with CI/CD

Use Inbound Kit in your deployment pipeline:

```yaml
# GitHub Actions example
- name: Deploy email infrastructure
  run: |
    echo "INBOUND_API_KEY=${{ secrets.INBOUND_API_KEY }}" > .env
    inbound-kit push --force
```

## Related Tools

- **[@inboundemail/sdk](https://www.npmjs.com/package/@inboundemail/sdk)** - Official Inbound Email SDK
- **[Inbound Email API](https://docs.inbound.new)** - Full API documentation

## 🤝 Contributing

We welcome contributions! Here's how to get started:

### Development Setup

1. **Clone the repository**:
   ```bash
   git clone https://github.com/inboundemail/sdk.git
   cd sdk/@inboundemail/inbound-kit
   ```

2. **Install dependencies**:
   ```bash
   bun install
   ```

3. **Build the project**:
   ```bash
   bun run build
   ```

4. **Link for local testing**:
   ```bash
   npm link
   # or
   bun link
   ```

5. **Test locally**:
   ```bash
   # Create a test directory
   mkdir test-inbound-kit && cd test-inbound-kit
   
   # Create test config
   echo 'INBOUND_API_KEY=your-test-key' > .env
   
   # Initialize and test
   inbound-kit init
   inbound-kit status
   ```

### Project Structure

```
src/
├── types.ts              # TypeScript type definitions
├── auth.ts               # Authentication handling
├── config.ts             # Configuration file loading/parsing
├── state.ts              # State management and API sync
├── cli.ts                # Main CLI entry point
├── index.ts              # Package exports
└── commands/             # CLI command implementations
    ├── init.ts           # Initialize configuration
    ├── push.ts           # Apply config to API
    ├── pull.ts           # Generate config from API
    ├── diff.ts           # Show differences
    └── status.ts         # Show current state
```

### Development Guidelines

#### Code Style
- Use TypeScript for all source files
- Follow existing code formatting (ESLint configured)
- Add JSDoc comments for public functions
- Use descriptive variable names and clear error messages

#### Testing
- Test CLI commands with real Inbound API (use test account)
- Test configuration loading with various formats
- Test error handling and edge cases
- Add integration tests for complex workflows

#### Adding New Features

1. **New Endpoint Types**:
   - Add type definition to `src/types.ts`
   - Update `normalizeEndpoint()` in `src/config.ts`
   - Update `convertToApiEndpointConfig()` in `src/state.ts`
   - Add validation logic
   - Update documentation and examples

2. **New CLI Commands**:
   - Create new file in `src/commands/`
   - Add command to `src/cli.ts`
   - Export from `src/index.ts`
   - Add tests and documentation

3. **Configuration Enhancements**:
   - Update `InboundConfig` interface in `src/types.ts`
   - Add validation in `src/config.ts`
   - Update state sync logic in `src/state.ts`
   - Add examples and documentation

### Testing Locally

1. **Set up test environment**:
   ```bash
   # In inbound-kit directory
   bun run build
   npm link # or bun link
   
   # In test directory
   mkdir ../test-kit && cd ../test-kit
   echo 'INBOUND_API_KEY=your-test-key' > .env
   ```

2. **Test CLI commands**:
   ```bash
   inbound-kit init --force
   inbound-kit status
   inbound-kit diff
   inbound-kit push --dry-run
   ```

3. **Test configuration formats**:
   ```bash
   # Test TypeScript config
   inbound-kit init --force
   # Edit inbound.config.ts
   inbound-kit diff
   
   # Test JSON config  
   rm inbound.config.ts
   echo '{"emailAddresses":{"test@example.com":"https://example.com"}}' > inbound.config.json
   inbound-kit diff
   ```

### Debugging

Enable verbose output for debugging:
```bash
inbound-kit status --verbose
inbound-kit push --verbose --dry-run
```

### Common Development Tasks

#### Adding Support for New Webhook Services

1. Add type definition:
   ```typescript
   // src/types.ts
   export interface CustomServiceEndpointConfig {
     type: 'custom_service'
     webhookUrl: string
     apiKey?: string
   }
   ```

2. Update endpoint config union:
   ```typescript
   export type EndpointConfig = 
     | WebhookEndpointConfig
     | CustomServiceEndpointConfig
     // ... other types
   ```

3. Add shorthand support:
   ```typescript
   // src/config.ts
   if ('customService' in shorthand) {
     return {
       type: 'custom_service',
       webhookUrl: shorthand.customService.url,
       apiKey: shorthand.customService.apiKey
     }
   }
   ```

4. Update API conversion:
   ```typescript
   // src/state.ts
   case 'custom_service':
     return {
       type: 'webhook', // Map to webhook in API
       config: {
         url: config.webhookUrl,
         headers: config.apiKey ? { 'Authorization': `Bearer ${config.apiKey}` } : {}
       }
     }
   ```

#### Adding New CLI Commands

1. Create command file:
   ```typescript
   // src/commands/validate.ts
   export async function validateCommand(options: CLIOptions): Promise<void> {
     // Implementation
   }
   ```

2. Add to CLI:
   ```typescript
   // src/cli.ts
   program
     .command('validate')
     .description('Validate configuration file')
     .action(async (cmdOptions) => {
       await validateCommand({ ...program.opts(), ...cmdOptions })
     })
   ```

### Pull Request Guidelines

1. **Before submitting**:
   - Run `bun run lint` and fix any issues
   - Run `bun run type-check` to ensure TypeScript compliance
   - Test your changes with real Inbound API
   - Update documentation if needed

2. **PR Description**:
   - Clearly describe the change and motivation
   - Include examples of new functionality
   - List any breaking changes
   - Add screenshots for CLI output changes

3. **Testing**:
   - Test with various configuration formats
   - Test error handling scenarios
   - Test with different API responses
   - Verify CLI help text and examples

### Release Process

1. Update version in `package.json`
2. Update `VERSION` constant in `src/index.ts` and `src/cli.ts`
3. Build and test: `bun run build && bun run test`
4. Create release notes
5. Publish: `npm publish`

### Getting Help

- 📖 **Documentation**: Check the README and inline code comments
- 🐛 **Issues**: [GitHub Issues](https://github.com/inboundemail/sdk/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/inboundemail/sdk/discussions)
- 📧 **Email**: For sensitive issues, email support@inbound.new

### Code of Conduct

Please be respectful and constructive in all interactions. We're building tools to help developers, so let's maintain a positive and inclusive environment.

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🔗 Related Projects

- **[@inboundemail/sdk](https://www.npmjs.com/package/@inboundemail/sdk)** - Official Inbound Email SDK
- **[Inbound Email API](https://docs.inbound.new)** - Full API documentation
- **[Inbound Email Dashboard](https://inbound.new)** - Web interface for email management

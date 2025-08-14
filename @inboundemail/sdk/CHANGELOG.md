# Changelog

All notable changes to the @inboundemail/sdk will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### ✨ Added
- **Inline Images Support**: Full support for embedding inline images in emails
  - Added `contentId` field to attachment types for inline image references
  - Support for both remote URLs and base64-encoded local images
  - Compatible with Resend's inline images API
  - Comprehensive utility functions for inline image management:
    - `createRemoteInlineImage()` - Create remote inline image attachments
    - `createBase64InlineImage()` - Create base64 inline image attachments
    - `generateContentId()` - Generate unique content IDs
    - `validateContentId()` - Validate content ID format
    - `extractContentIdsFromHtml()` - Extract content IDs from HTML
    - `validateInlineImageReferences()` - Validate HTML references match attachments
    - `getContentTypeFromExtension()` - Auto-detect content types
  - Added comprehensive examples and test cases
  - Updated documentation with inline images section

## [3.0.0] - 2025-01-23

### 🚨 BREAKING CHANGES

This release aligns the SDK with the Resend SDK pattern and introduces breaking changes to improve developer experience and consistency.

#### Constructor Changes
- **BREAKING**: Constructor now only accepts API key as string parameter, matching Resend pattern
  - **Before**: `new Inbound({ apiKey: 'key', baseUrl: 'url', defaultReplyFrom: 'email' })`
  - **After**: `new Inbound('key')` or `new Inbound('key', 'custom-base-url')`
- **BREAKING**: Removed `defaultReplyFrom` configuration - replies now require explicit `from` parameter

#### API Field Name Changes (Resend Compatibility)
- **BREAKING**: Changed `reply_to` to `replyTo` in send/reply requests
- **BREAKING**: Changed `content_type` to `contentType` in attachment objects
- **BREAKING**: Changed `include_original` to `includeOriginal` in reply requests

#### Reply Method Changes
- **BREAKING**: `reply()` method no longer accepts simple string messages
  - **Before**: `inbound.reply(email, "Thanks!")`
  - **After**: `inbound.reply(email, { from: 'support@domain.com', text: 'Thanks!' })`
- **BREAKING**: `reply()` method requires explicit `from` parameter in all cases

### ✨ Added
- Added `tags` support for emails (Resend-compatible)
- Added `replyTo` field support in reply requests
- Improved TypeScript types for better IDE support

### 🔧 Fixed
- Removed circular dependency in package.json
- Fixed inconsistent examples in documentation
- Updated all examples to use new constructor pattern
- **IMPORTANT**: Updated API endpoints to support both snake_case and camelCase field names for backward compatibility

### 📚 Documentation
- Updated README with new usage patterns
- Added migration guide examples
- Clarified breaking changes in constructor usage

### Migration Guide

#### Update Constructor Usage
```typescript
// v2.x
const inbound = new Inbound({
  apiKey: process.env.INBOUND_API_KEY!,
  baseUrl: 'https://custom.url',
  defaultReplyFrom: 'support@domain.com'
})

// v3.x
const inbound = new Inbound(
  process.env.INBOUND_API_KEY!,
  'https://custom.url'  // optional
)
```

#### Update Send Requests
```typescript
// v2.x
await inbound.emails.send({
  from: 'hello@domain.com',
  to: 'user@example.com',
  reply_to: 'noreply@domain.com',  // snake_case
  attachments: [{
    filename: 'doc.pdf',
    content: 'base64...',
    content_type: 'application/pdf'  // snake_case
  }]
})

// v3.x
await inbound.emails.send({
  from: 'hello@domain.com',
  to: 'user@example.com',
  replyTo: 'noreply@domain.com',  // camelCase
  attachments: [{
    filename: 'doc.pdf',
    content: 'base64...',
    contentType: 'application/pdf'  // camelCase
  }],
  tags: [{ name: 'campaign', value: 'newsletter' }]  // new feature
})
```

#### Update Reply Usage
```typescript
// v2.x
await inbound.reply(email, "Thanks for your message!")

// v3.x
await inbound.reply(email, {
  from: 'support@domain.com',
  text: 'Thanks for your message!'
})
```
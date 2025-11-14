# v3 API Implementation Checklist

## Phase 1: Infrastructure Setup

### Dependencies
- [ ] Install oRPC packages
  ```bash
  bun add @orpc/server @orpc/client @orpc/openapi
  ```
- [ ] Install rate limiting
  ```bash
  bun add @upstash/redis @upstash/ratelimit
  ```
- [ ] Ensure Sentry is configured
  ```bash
  bun add @sentry/nextjs
  ```

### Core Files
- [ ] Create `app/api/v3/_lib/context.ts`
  - [ ] BaseContext interface
  - [ ] AuthenticatedContext interface
  - [ ] createContext function
  - [ ] createAuthenticatedContext function
  
- [ ] Create `app/api/v3/_lib/rate-limiter.ts`
  - [ ] Configure Upstash Redis client
  - [ ] Set up 5 RPS rate limiter
  - [ ] checkRateLimit function

- [ ] Create `app/api/v3/_lib/middleware.ts`
  - [ ] withAuth middleware
  - [ ] Error handling
  - [ ] Rate limit header injection

- [ ] Create `app/api/v3/_lib/procedures.ts`
  - [ ] baseProcedure
  - [ ] authenticatedProcedure
  - [ ] Sentry integration

- [ ] Create `app/api/v3/_lib/error-handler.ts`
  - [ ] APIError class
  - [ ] Error code constants
  - [ ] Error response formatter

### Type Definitions
- [ ] Create `app/api/v3/types/common.ts`
  - [ ] PaginationSchema
  - [ ] PaginatedResponse type
  - [ ] SuccessResponse type

- [ ] Create `app/api/v3/types/errors.ts`
  - [ ] ErrorResponseSchema
  - [ ] ErrorResponse type
  - [ ] APIError class
  - [ ] ErrorCodes enum

- [ ] Create `app/api/v3/types/domain.ts`
  - [ ] Domain type (from schema)
  - [ ] CreateDomainSchema
  - [ ] UpdateDomainSchema
  - [ ] GetDomainSchema
  - [ ] ListDomainsSchema
  - [ ] DomainResponse interface

- [ ] Create `app/api/v3/types/email.ts`
  - [ ] Email type (from schema)
  - [ ] SendEmailSchema
  - [ ] GetEmailSchema
  - [ ] ListEmailsSchema
  - [ ] EmailResponse interface

- [ ] Create `app/api/v3/types/endpoint.ts`
  - [ ] Endpoint type (from schema)
  - [ ] CreateEndpointSchema
  - [ ] UpdateEndpointSchema
  - [ ] GetEndpointSchema
  - [ ] ListEndpointsSchema
  - [ ] EndpointResponse interface

## Phase 2: Domains Resource

### Create Domain
- [ ] Create `app/api/v3/domains/create.ts`
  - [ ] Define createDomain procedure
  - [ ] Input: CreateDomainSchema
  - [ ] Output: DomainResponse
  - [ ] OpenAPI metadata
  - [ ] Business logic (check duplicates, insert)
  - [ ] Error handling
  - [ ] Logging

### Get Domain
- [ ] Create `app/api/v3/domains/get.ts`
  - [ ] Define getDomain procedure
  - [ ] Input: GetDomainSchema
  - [ ] Output: DomainResponse
  - [ ] OpenAPI metadata
  - [ ] Fetch domain with stats
  - [ ] Optional verification check
  - [ ] Error handling (404)

### Update Domain
- [ ] Create `app/api/v3/domains/update.ts`
  - [ ] Define updateDomain procedure
  - [ ] Input: { id, data: UpdateDomainSchema }
  - [ ] Output: DomainResponse
  - [ ] OpenAPI metadata
  - [ ] Verify ownership
  - [ ] Update logic
  - [ ] Error handling

### Delete Domain
- [ ] Create `app/api/v3/domains/delete.ts`
  - [ ] Define deleteDomain procedure
  - [ ] Input: { id }
  - [ ] Output: { success: boolean }
  - [ ] OpenAPI metadata
  - [ ] Verify ownership
  - [ ] Delete logic
  - [ ] Error handling

### List Domains
- [ ] Create `app/api/v3/domains/list.ts`
  - [ ] Define listDomains procedure
  - [ ] Input: ListDomainsSchema
  - [ ] Output: PaginatedResponse<Domain>
  - [ ] OpenAPI metadata
  - [ ] Pagination logic
  - [ ] Total count
  - [ ] Filter by status

### Router
- [ ] Create `app/api/v3/domains/index.ts`
  - [ ] Import all procedures
  - [ ] Export domainsRouter

### Tests
- [ ] Create `app/api/v3/domains/create.test.ts`
- [ ] Create `app/api/v3/domains/get.test.ts`
- [ ] Create `app/api/v3/domains/update.test.ts`
- [ ] Create `app/api/v3/domains/delete.test.ts`
- [ ] Create `app/api/v3/domains/list.test.ts`

## Phase 3: Emails Resource

### Send Email
- [ ] Create `app/api/v3/emails/send.ts`
  - [ ] Define sendEmail procedure
  - [ ] Input: SendEmailSchema
  - [ ] Output: EmailResponse
  - [ ] OpenAPI metadata
  - [ ] Validation
  - [ ] Send logic
  - [ ] Error handling

### Get Email
- [ ] Create `app/api/v3/emails/get.ts`
  - [ ] Define getEmail procedure
  - [ ] Input: GetEmailSchema
  - [ ] Output: EmailResponse
  - [ ] OpenAPI metadata
  - [ ] Fetch logic
  - [ ] Error handling

### List Emails
- [ ] Create `app/api/v3/emails/list.ts`
  - [ ] Define listEmails procedure
  - [ ] Input: ListEmailsSchema
  - [ ] Output: PaginatedResponse<Email>
  - [ ] OpenAPI metadata
  - [ ] Pagination
  - [ ] Filtering

### Delete Email
- [ ] Create `app/api/v3/emails/delete.ts`
  - [ ] Define deleteEmail procedure
  - [ ] Input: { id }
  - [ ] Output: { success: boolean }
  - [ ] OpenAPI metadata
  - [ ] Delete logic
  - [ ] Error handling

### Router
- [ ] Create `app/api/v3/emails/index.ts`
  - [ ] Import all procedures
  - [ ] Export emailsRouter

### Tests
- [ ] Create tests for all email operations

## Phase 4: Endpoints Resource

### Create Endpoint
- [ ] Create `app/api/v3/endpoints/create.ts`
  - [ ] Define createEndpoint procedure
  - [ ] Webhook/function endpoint logic
  - [ ] Validation
  - [ ] Error handling

### Get Endpoint
- [ ] Create `app/api/v3/endpoints/get.ts`
  - [ ] Define getEndpoint procedure
  - [ ] Fetch logic
  - [ ] Error handling

### Update Endpoint
- [ ] Create `app/api/v3/endpoints/update.ts`
  - [ ] Define updateEndpoint procedure
  - [ ] Update logic
  - [ ] Error handling

### Delete Endpoint
- [ ] Create `app/api/v3/endpoints/delete.ts`
  - [ ] Define deleteEndpoint procedure
  - [ ] Delete logic
  - [ ] Error handling

### List Endpoints
- [ ] Create `app/api/v3/endpoints/list.ts`
  - [ ] Define listEndpoints procedure
  - [ ] Pagination
  - [ ] Filtering

### Test Endpoint
- [ ] Create `app/api/v3/endpoints/test.ts`
  - [ ] Define testEndpoint procedure
  - [ ] Test delivery logic
  - [ ] Error handling

### Router
- [ ] Create `app/api/v3/endpoints/index.ts`
  - [ ] Import all procedures
  - [ ] Export endpointsRouter

### Tests
- [ ] Create tests for all endpoint operations

## Phase 5: Email Addresses Resource

### Create Email Address
- [ ] Create `app/api/v3/email-addresses/create.ts`

### Get Email Address
- [ ] Create `app/api/v3/email-addresses/get.ts`

### Update Email Address
- [ ] Create `app/api/v3/email-addresses/update.ts`

### Delete Email Address
- [ ] Create `app/api/v3/email-addresses/delete.ts`

### List Email Addresses
- [ ] Create `app/api/v3/email-addresses/list.ts`

### Router
- [ ] Create `app/api/v3/email-addresses/index.ts`

### Tests
- [ ] Create tests for all email address operations

## Phase 6: OpenAPI Setup

### Main Router
- [ ] Create `app/api/v3/route.ts`
  - [ ] Import all resource routers
  - [ ] Create appRouter
  - [ ] Export AppRouter type
  - [ ] Configure openAPIHandler
  - [ ] Add API info (title, version, description)
  - [ ] Add servers (production, dev)
  - [ ] Add security schemes (Bearer, Session)
  - [ ] Export GET/POST/PUT/DELETE handlers

### OpenAPI Spec
- [ ] Test OpenAPI spec generation
  - [ ] Visit `/v3/openapi.json`
  - [ ] Verify all endpoints listed
  - [ ] Verify schemas correct
  - [ ] Verify security schemes

### Swagger UI (Optional)
- [ ] Set up Swagger UI
  - [ ] Install `swagger-ui-react`
  - [ ] Create `/v3/docs` page
  - [ ] Load OpenAPI spec
  - [ ] Test interactive docs

## Phase 7: Client Setup

### TypeScript Client
- [ ] Create `lib/api/v3-client.ts`
  - [ ] Import AppRouter type
  - [ ] Configure createClient
  - [ ] Set baseURL
  - [ ] Export v3Client

### React Query Integration
- [ ] Create hooks for common operations
  - [ ] useDomains hook
  - [ ] useEmails hook
  - [ ] useEndpoints hook
  - [ ] useMutations

### Server-Side Usage Examples
- [ ] Document server component usage
- [ ] Document server action usage
- [ ] Document API route usage

### Client-Side Usage Examples
- [ ] Document React component usage
- [ ] Document form submission
- [ ] Document error handling

## Phase 8: Testing

### Unit Tests
- [ ] Test all procedures individually
- [ ] Test error cases
- [ ] Test validation
- [ ] Test rate limiting

### Integration Tests
- [ ] Test full request/response cycle
- [ ] Test authentication (session + API key)
- [ ] Test rate limiting in practice
- [ ] Test error responses

### Performance Tests
- [ ] Measure response times
- [ ] Test under load
- [ ] Verify rate limiting works at scale
- [ ] Check Sentry overhead

### OpenAPI Tests
- [ ] Validate OpenAPI spec
- [ ] Test with external tools (Postman, Insomnia)
- [ ] Verify client generation works

## Phase 9: Documentation

### API Documentation
- [ ] Update Mintlify docs for v3
- [ ] Add migration guide from v2
- [ ] Document authentication
- [ ] Document rate limiting
- [ ] Document error codes
- [ ] Add code examples

### Internal Documentation
- [ ] Update README with v3 info
- [ ] Document deployment process
- [ ] Document monitoring setup
- [ ] Add troubleshooting guide

### SDK Documentation
- [ ] TypeScript client docs
- [ ] React hooks docs
- [ ] Server-side usage docs
- [ ] Best practices guide

## Phase 10: Deployment

### Environment Setup
- [ ] Configure Upstash Redis (production)
- [ ] Set up environment variables
  - [ ] `UPSTASH_REDIS_REST_URL`
  - [ ] `UPSTASH_REDIS_REST_TOKEN`
  - [ ] Verify Sentry DSN

### Monitoring
- [ ] Set up Sentry alerts
- [ ] Configure error thresholds
- [ ] Set up performance monitoring
- [ ] Add custom metrics

### Deployment
- [ ] Deploy to staging
- [ ] Run smoke tests
- [ ] Deploy to production
- [ ] Monitor for errors

### Rollout
- [ ] Start with internal use
- [ ] Beta test with select users
- [ ] Gradual rollout to all users
- [ ] Monitor metrics

## Phase 11: Migration

### v2 Deprecation Plan
- [ ] Announce v3 availability
- [ ] Document migration path
- [ ] Provide migration tools/scripts
- [ ] Set v2 deprecation timeline
- [ ] Monitor v2 usage decline

### Client Migration
- [ ] Update internal apps to v3
- [ ] Help external clients migrate
- [ ] Provide support during transition
- [ ] Deprecate v2 endpoints gradually

## Success Metrics

### Technical
- [ ] 100% test coverage for critical paths
- [ ] < 200ms p95 response time
- [ ] 0 security vulnerabilities
- [ ] 99.9% uptime

### Adoption
- [ ] 50% of traffic on v3 within 3 months
- [ ] 90% of traffic on v3 within 6 months
- [ ] v2 fully deprecated within 12 months

### Developer Experience
- [ ] Positive feedback from users
- [ ] Reduced support tickets
- [ ] Active SDK usage
- [ ] Community contributions

## Notes

- Each checkbox represents a distinct task
- Estimated time: 4-6 weeks for full implementation
- Can be done incrementally (resource by resource)
- Don't need to complete all resources before deploying
- Start with Domains → Emails → Endpoints → Others


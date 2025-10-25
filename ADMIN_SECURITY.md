# Admin Security Implementation

## Overview
This document outlines the comprehensive security measures implemented to protect admin pages and functionality from unauthorized access by regular users.

## Security Layers

### 1. Middleware Protection (`/middleware.ts`)
- **Route Protection**: All `/admin/*` routes are protected at the middleware level
- **Session Validation**: Checks for valid user session before allowing access
- **Role Verification**: Verifies user has `admin` role
- **Automatic Redirects**: 
  - Unauthenticated users → `/login` (with redirect parameter)
  - Non-admin users → `/logs` (main app)

### 2. Server-Side Layout Protection (`/app/(main)/admin/layout.tsx`)
- **Double Authentication**: Server-side session and role checks
- **Early Redirect**: Redirects before rendering any admin content
- **Secure by Default**: Uses server components for authentication

### 3. Client-Side Page Protection
All admin pages have additional client-side protection:
- `/admin/page.tsx` - Main admin panel
- `/admin/user-information/page.tsx` - User analytics
- `/admin/lambda/page.tsx` - Lambda monitoring

**Features:**
- Session validation on component mount
- Role verification with console warnings for security monitoring
- Error UI for unauthorized access attempts
- Graceful degradation

### 4. Server Action Protection
All admin server actions are protected with `requireAdmin()`:

#### Lambda Actions (`/app/(main)/admin/actions/lambda.ts`)
- `getLambdaFunctionInfo()` - AWS Lambda function details
- `getLambdaLogStreams()` - CloudWatch log streams
- `getLambdaLogs()` - CloudWatch logs
- `getLambdaRecentLogs()` - Recent log entries
- `getLambdaMoreLogs()` - Paginated logs
- `checkAWSConnection()` - AWS connectivity test

#### Domain Management (`/app/actions/primary.ts`)
- `getAllDomainsForAdmin()` - Cross-user domain listing
- `getDomainEmailAddressesForAdmin()` - Domain email addresses

#### User Analytics (`/app/actions/user-analytics.ts`)
- `getUserAnalytics()` - User activity analytics
- `exportUserEmails()` - User email exports

#### Feature Flags (`/app/actions/feature-flags.ts`)
- `addFeatureFlag()` - Add user feature flags (admin or self)
- `removeFeatureFlag()` - Remove user feature flags (admin or self)
- `getUserFeatureFlags()` - View user feature flags (admin or self)

### 5. Navigation Security (`/components/app-sidebar.tsx`)
- **Conditional Rendering**: Admin navigation only shown to admin users
- **Role-Based Filtering**: Uses `isUserAdmin()` helper function
- **Clean UI**: Non-admin users never see admin menu items

### 6. Authentication Utilities (`/lib/auth/auth-utils.ts`)
Centralized security functions:
- `requireAdmin()` - Throws error if user is not admin
- `isCurrentUserAdmin()` - Checks current user's admin status
- `getCurrentSession()` - Retrieves current session safely
- `isAdminRole()` - Validates role string

## Protected Resources

### Admin Pages
- `/admin` - Main admin dashboard
- `/admin/user-information` - User analytics and monitoring
- `/admin/lambda` - AWS Lambda monitoring and logs

### Admin Functions
- User management (create, ban, delete, role changes)
- Domain management across all users
- Email address management
- Feature flag management
- Lambda function monitoring
- CloudWatch logs access
- User analytics and exports
- AWS service access

### Sensitive Data
- All user information across the platform
- Email content and metadata
- AWS infrastructure details
- System logs and monitoring data
- Feature flag configurations

## Security Testing

### Manual Testing Checklist
- [ ] Non-admin user cannot access `/admin` URLs
- [ ] Non-admin user redirected to `/logs` from admin pages  
- [ ] Admin navigation hidden from non-admin users
- [ ] Server actions throw errors for non-admin users
- [ ] Lambda functions protected from unauthorized access
- [ ] Domain management restricted to admins
- [ ] User analytics only accessible to admins

### Automated Testing
Run the security test script:
```bash
npx tsx scripts/test-admin-security.ts
```

## Error Handling

### Middleware Errors
- Authentication failures redirect to login
- Network errors redirect to login for security
- Malformed requests are blocked

### Server Action Errors
- `requireAdmin()` throws descriptive errors
- All admin actions return proper error responses
- Errors are logged for security monitoring

### Client-Side Errors
- Graceful error UI for unauthorized access
- Console warnings for security monitoring
- Fallback to main application

## Security Best Practices

### Implemented
✅ **Defense in Depth** - Multiple layers of protection  
✅ **Fail Secure** - Errors default to blocking access  
✅ **Least Privilege** - Only admins can access admin features  
✅ **Session Validation** - All requests validate authentication  
✅ **Role-Based Access** - Granular permission checking  
✅ **Secure Redirects** - Proper redirect handling  
✅ **Error Logging** - Security events are logged  
✅ **Input Validation** - Server actions validate inputs  

### Monitoring
- Console warnings for unauthorized access attempts
- Server-side error logging for security events
- Session validation on every admin request

## Maintenance

### Adding New Admin Features
1. Add server actions with `requireAdmin()` check
2. Create pages under `/admin/` directory (auto-protected by middleware)
3. Add navigation items to `navigationConfig.admin`
4. Test with non-admin user account

### Security Updates
- Regularly review admin access logs
- Monitor for unauthorized access attempts
- Update authentication utilities as needed
- Test security measures after auth system changes

## Emergency Procedures

### If Security Breach Detected
1. Check server logs for unauthorized access patterns
2. Review user sessions and admin role assignments
3. Audit recent admin actions in database
4. Consider temporary admin feature disable if needed

### Admin Access Recovery
If admin access is lost:
1. Use database direct access to update user role
2. Verify session and authentication system
3. Test admin access with known admin account
4. Review middleware and layout protection

## Compliance Notes

This implementation provides:
- **Authentication** - All admin access requires valid login
- **Authorization** - Role-based access control for admin features
- **Audit Trail** - Logging of admin actions and access attempts
- **Data Protection** - Sensitive data only accessible to authorized users
- **Secure Design** - Multiple layers prevent unauthorized access
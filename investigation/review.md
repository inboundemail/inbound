# Deprecated Tables Usage Review: `receivedEmails` & `parsedEmails`

## Executive Summary

The `receivedEmails` and `parsedEmails` tables are marked as deprecated in favor of `structuredEmails`, but they are still actively used throughout the codebase. This review identifies all usage locations and provides a migration path.

## Current Usage Analysis

### 1. **Schema Definitions** (Active - Required for Migration)
- **File**: [`../lib/db/schema.ts`](../lib/db/schema.ts)
  - **Line 172**: `export const receivedEmails = pgTable('received_emails', { // deprecating.... use structuredEmails instead`
  - **Line 223**: `export const parsedEmails = pgTable('parsed_emails', { // deprecating.... use structuredEmails insteadc`
  - **Lines 529-532**: Type exports for both tables

### 2. **Webhook Processing** (Active - Core Functionality)
- **File**: [`app/api/inbound/webhook/route.ts`](app/api/inbound/webhook/route.ts)
  - **Line 5**: Import of both deprecated tables
  - **Lines 253, 269**: Inserting into `parsedEmails` table
  - **Lines 375-382**: Reading from `receivedEmails` table
  - **Lines 405-407**: Querying `receivedEmails` table
  - **Line 901**: Inserting into `receivedEmails` table
  - **Lines 916-941**: Comments explaining dual record creation strategy

### 3. **Email Routing** (Active - Core Functionality)
- **File**: [`../lib/email-management/email-router.ts`](../lib/email-management/email-router.ts)
  - **Lines 88, 99-104**: Querying `receivedEmails` table to get recipient information
  - **Critical dependency**: Router still relies on `receivedEmails` for recipient lookup

### 4. **Analytics & Reporting** (Active - Business Critical)
- **File**: [`../app/actions/user-analytics.ts`](../app/actions/user-analytics.ts)
  - **Line 9**: Import of `receivedEmails`
  - **Lines 103, 161-167**: SQL queries counting from `received_emails` table
  - **Lines 218, 222, 231, 242, 254**: Multiple queries using `received_emails`
  - **Lines 272, 282-283**: Processing received email counts
  - **Lines 384-397, 409-411, 449-451, 464-466, 500-502, 515-517**: User-specific queries
  - **Lines 574-576, 592-594**: Timeline queries

### 5. **Admin Dashboard** (Active - User-Facing)
- **File**: [`../app/(main)/admin/user-information/page.tsx`](../app/(main)/admin/user-information/page.tsx)
  - **Line 381**: Display `user.receivedEmails` count
  - **Line 690**: Display `selectedUser.receivedEmails` count

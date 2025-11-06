# Emoji Encoding Fix

## Problem
Emojis and other UTF-8 characters were being corrupted when sent via email. For example:
- "👋" was appearing as "=K"
- "💡" was appearing as "=�"

## Root Cause
The issue was in the email sending code where:
1. Email headers declared `Content-Transfer-Encoding: quoted-printable`
2. But the actual content was NOT being encoded using quoted-printable encoding
3. This caused UTF-8 multi-byte characters (like emojis) to be corrupted

## Solution
Implemented proper quoted-printable encoding that:
- Converts non-ASCII bytes (including emojis) to =XX hex format
- Handles UTF-8 properly by processing byte-by-byte
- Respects line length limits (76 chars) with soft line breaks
- Properly encodes special characters like equals signs

## Files Modified

### New File
- `lib/email-management/encoding.ts` - Shared encoding utilities with proper quoted-printable implementation

### Updated Files
1. `app/api/v2/helper/email-builder.ts`
   - Imported `encodeQuotedPrintable` from shared utility
   - Removed incomplete local implementation
   - Email builder now properly encodes text and HTML content

2. `app/api/v2/emails/[id]/reply/route.ts`
   - Added import for `encodeQuotedPrintable`
   - Applied encoding to all text and HTML content before adding to raw message
   - Fixed 6 instances where content was not being encoded

3. `app/api/v2/emails/[id]/reply-10-01-25/route.ts`
   - Added import for `encodeQuotedPrintable`
   - Applied encoding to all text and HTML content
   - Fixed 4 instances where content was not being encoded

## How Quoted-Printable Encoding Works

Quoted-printable is an email encoding standard (RFC 2045) that:
- Represents printable ASCII characters (33-126) as themselves
- Encodes non-ASCII bytes as `=XX` where XX is the hexadecimal value
- Encodes the equals sign itself as `=3D`
- Uses soft line breaks (`=\r\n`) to limit line length to 76 characters
- Preserves line breaks in the original text as `\r\n`

Example:
```
Input:  "Hey 👋"
Output: "Hey =F0=9F=91=8B"
```

The emoji 👋 (U+1F44B) is represented in UTF-8 as 4 bytes: F0 9F 91 8B

## Testing
To test the fix, send an email with emojis through the system:
1. Use `/api/v2/emails` endpoint to send an email
2. Include emojis in text or HTML body
3. Verify the received email displays emojis correctly

## Notes
- The encoding is applied automatically when using `buildRawEmailMessage()` from `email-builder.ts`
- Reply routes that build raw messages manually must import and use `encodeQuotedPrintable()`
- The encoder handles edge cases like spaces at end of lines, tabs, and various line break formats
- Fallback behavior returns text as-is if encoding fails (prevents complete failure)

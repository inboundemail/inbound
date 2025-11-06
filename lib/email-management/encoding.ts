/**
 * Email encoding utilities for proper MIME content handling
 * Provides quoted-printable encoding for text content
 */

/**
 * Encode content for email transmission using quoted-printable encoding
 * Properly handles UTF-8 characters including emojis
 * 
 * Quoted-printable encoding rules (RFC 2045):
 * - Any printable ASCII character (33-126) except = can be represented as itself
 * - Equals sign must be encoded as =3D
 * - Non-printable characters and non-ASCII bytes are encoded as =XX where XX is hex
 * - Lines should be no longer than 76 characters (soft line breaks with =)
 * - Tabs and spaces are printable but must be encoded if at end of line
 */
export function encodeQuotedPrintable(text: string): string {
  if (!text) return ''
  
  try {
    // Convert string to UTF-8 bytes
    const utf8Bytes = Buffer.from(text, 'utf8')
    let encoded = ''
    let lineLength = 0
    const MAX_LINE_LENGTH = 75 // Leave room for soft line break (=)
    
    for (let i = 0; i < utf8Bytes.length; i++) {
      const byte = utf8Bytes[i]
      const char = String.fromCharCode(byte)
      
      // Check if we need to encode this byte
      const needsEncoding = 
        byte < 33 || // Control characters and space at start
        byte > 126 || // Non-ASCII
        byte === 61 || // Equals sign (=)
        (byte === 32 && (i === utf8Bytes.length - 1 || utf8Bytes[i + 1] === 13 || utf8Bytes[i + 1] === 10)) || // Space at end of line
        (byte === 9 && (i === utf8Bytes.length - 1 || utf8Bytes[i + 1] === 13 || utf8Bytes[i + 1] === 10)) // Tab at end of line
      
      let output: string
      if (needsEncoding && byte !== 13 && byte !== 10) {
        // Encode as =XX (hex)
        output = '=' + byte.toString(16).toUpperCase().padStart(2, '0')
      } else if (byte === 13 || byte === 10) {
        // Handle line breaks - reset line length counter
        // CR and LF should stay as is (email uses CRLF)
        if (byte === 13 && i + 1 < utf8Bytes.length && utf8Bytes[i + 1] === 10) {
          // CRLF pair
          encoded += '\r\n'
          i++ // Skip the LF
          lineLength = 0
          continue
        } else if (byte === 10) {
          // Standalone LF - convert to CRLF
          encoded += '\r\n'
          lineLength = 0
          continue
        } else {
          // Standalone CR - keep as is and reset line length
          output = char
          lineLength = 0
        }
      } else {
        // Printable ASCII character
        output = char
      }
      
      // Check if adding this would exceed line length
      if (lineLength + output.length > MAX_LINE_LENGTH && byte !== 13 && byte !== 10) {
        // Add soft line break
        encoded += '=\r\n'
        lineLength = 0
      }
      
      encoded += output
      lineLength += output.length
    }
    
    return encoded
  } catch (error) {
    console.error('Error encoding quoted-printable:', error)
    // Fallback to basic encoding if something goes wrong
    return text.replace(/\r?\n/g, '\r\n')
  }
}

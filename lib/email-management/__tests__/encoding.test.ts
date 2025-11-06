/**
 * Tests for quoted-printable encoding
 */
import { encodeQuotedPrintable } from '../encoding'

describe('encodeQuotedPrintable', () => {
  it('should encode emojis correctly', () => {
    const input = 'Hey 👋'
    const encoded = encodeQuotedPrintable(input)
    
    // 👋 (U+1F44B) in UTF-8 is: F0 9F 91 8B
    expect(encoded).toContain('=F0=9F=91=8B')
    expect(encoded).toContain('Hey')
  })

  it('should encode multiple emojis', () => {
    const input = 'Hey 👋\n\n💡 Pro Tip: Test this!'
    const encoded = encodeQuotedPrintable(input)
    
    // Should contain encoded emojis
    expect(encoded).toContain('=F0=9F=91=8B') // 👋
    expect(encoded).toContain('=F0=9F=92=A1') // 💡
    expect(encoded).toContain('Hey')
    expect(encoded).toContain('Pro Tip')
  })

  it('should handle regular ASCII text', () => {
    const input = 'Hello World'
    const encoded = encodeQuotedPrintable(input)
    
    // Regular ASCII should pass through
    expect(encoded).toBe('Hello World')
  })

  it('should encode equals signs', () => {
    const input = 'a = b'
    const encoded = encodeQuotedPrintable(input)
    
    // Equals sign should be encoded as =3D
    expect(encoded).toBe('a =3D b')
  })

  it('should handle line breaks', () => {
    const input = 'Line 1\nLine 2\r\nLine 3'
    const encoded = encodeQuotedPrintable(input)
    
    // All line breaks should become CRLF
    expect(encoded).toContain('\r\n')
    expect(encoded).toContain('Line 1')
    expect(encoded).toContain('Line 2')
    expect(encoded).toContain('Line 3')
  })

  it('should handle special characters', () => {
    const input = 'Café ñ résumé'
    const encoded = encodeQuotedPrintable(input)
    
    // Non-ASCII characters should be encoded
    expect(encoded).toContain('=') // Should have encoded characters
    expect(encoded).toContain('Caf') // ASCII part
  })

  it('should handle empty strings', () => {
    const encoded = encodeQuotedPrintable('')
    expect(encoded).toBe('')
  })

  it('should handle long lines with soft breaks', () => {
    // Create a string longer than 76 characters
    const input = 'a'.repeat(100)
    const encoded = encodeQuotedPrintable(input)
    
    // Should have soft line breaks for long lines
    const lines = encoded.split('\r\n')
    
    // Each line (except possibly the last) should be <= 76 characters
    for (let i = 0; i < lines.length - 1; i++) {
      expect(lines[i].length).toBeLessThanOrEqual(76)
    }
  })

  it('should encode complex real-world email content', () => {
    const input = `Hey 👋

Thanks for setting up Slackbound! My name is Ryan.

💡 Pro Tip: Try replying to this message!

- Ryan`
    
    const encoded = encodeQuotedPrintable(input)
    
    // Should contain encoded emojis
    expect(encoded).toContain('=F0=9F=91=8B') // 👋
    expect(encoded).toContain('=F0=9F=92=A1') // 💡
    
    // Should preserve text structure
    expect(encoded).toContain('Hey')
    expect(encoded).toContain('Ryan')
    expect(encoded).toContain('Pro Tip')
    expect(encoded).toContain('Slackbound')
  })
})

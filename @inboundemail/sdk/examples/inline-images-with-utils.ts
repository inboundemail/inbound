/**
 * Inline Images with Utilities Example - Inbound Email SDK
 * 
 * This example demonstrates how to use the built-in utility functions
 * to work with inline images more easily and safely.
 */

import { 
  Inbound,
  createRemoteInlineImage,
  createBase64InlineImage,
  generateContentId,
  validateContentId,
  extractContentIdsFromHtml,
  validateInlineImageReferences,
  getContentTypeFromExtension
} from '../src/index'

// Initialize the client
const inbound = new Inbound('your-api-key-here')

/**
 * Example 1: Using utility functions to create remote inline images
 */
async function sendEmailWithUtilityRemoteImage() {
  try {
    // Use utility to create inline image attachment
    const logoAttachment = createRemoteInlineImage(
      'https://resend.com/static/sample/logo.png',
      'company-logo',
      'logo.png'
    )

    const result = await inbound.emails.send({
      from: 'Acme <hello@yourdomain.com>',
      to: ['recipient@example.com'],
      subject: 'Welcome with utility-created inline image',
      html: '<p>Welcome! Here is our logo: <img src="cid:company-logo" alt="Logo"/></p>',
      attachments: [logoAttachment]
    })

    console.log('✅ Email sent with utility-created remote image:', result.id)
    return result
  } catch (error) {
    console.error('❌ Error:', error)
    throw error
  }
}

/**
 * Example 2: Using utility functions to create base64 inline images
 */
async function sendEmailWithUtilityBase64Image() {
  try {
    // Simple 1x1 transparent PNG in base64
    const base64Image = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChAI9jU77zgAAAABJRU5ErkJggg=="

    // Use utility to create inline image attachment
    const imageAttachment = createBase64InlineImage(
      base64Image,
      'pixel.png',
      'transparent-pixel',
      'image/png'
    )

    const result = await inbound.emails.send({
      from: 'Acme <hello@yourdomain.com>',
      to: ['recipient@example.com'],
      subject: 'Email with utility-created base64 image',
      html: '<p>Here is a transparent pixel: <img src="cid:transparent-pixel" alt="Pixel"/></p>',
      attachments: [imageAttachment]
    })

    console.log('✅ Email sent with utility-created base64 image:', result.id)
    return result
  } catch (error) {
    console.error('❌ Error:', error)
    throw error
  }
}

/**
 * Example 3: Auto-generating contentIds
 */
async function sendEmailWithGeneratedContentIds() {
  try {
    // Generate unique contentIds
    const logoId = generateContentId('logo')
    const bannerId = generateContentId('banner')

    console.log('Generated contentIds:', { logoId, bannerId })

    const result = await inbound.emails.send({
      from: 'Newsletter <newsletter@yourdomain.com>',
      to: ['subscriber@example.com'],
      subject: 'Newsletter with auto-generated contentIds',
      html: `
        <div>
          <img src="cid:${logoId}" alt="Logo" style="width: 100px;"/>
          <h1>Monthly Newsletter</h1>
          <img src="cid:${bannerId}" alt="Banner" style="width: 300px;"/>
          <p>Thanks for subscribing!</p>
        </div>
      `,
      attachments: [
        createRemoteInlineImage(
          'https://resend.com/static/sample/logo.png',
          logoId
        ),
        createRemoteInlineImage(
          'https://via.placeholder.com/300x100/0066cc/ffffff?text=Newsletter+Banner',
          bannerId
        )
      ]
    })

    console.log('✅ Newsletter sent with generated contentIds:', result.id)
    return result
  } catch (error) {
    console.error('❌ Error:', error)
    throw error
  }
}

/**
 * Example 4: Validating inline image references
 */
async function sendEmailWithValidation() {
  try {
    const html = `
      <div>
        <h1>Product Showcase</h1>
        <p>Main product: <img src="cid:main-product" alt="Main Product"/></p>
        <p>Feature highlight: <img src="cid:feature" alt="Feature"/></p>
        <p>Company logo: <img src="cid:company-logo" alt="Logo"/></p>
      </div>
    `

    // Create attachments
    const attachments = [
      createRemoteInlineImage(
        'https://via.placeholder.com/200x200/ff6600/ffffff?text=Product',
        'main-product'
      ),
      createRemoteInlineImage(
        'https://via.placeholder.com/150x150/28a745/ffffff?text=Feature',
        'feature'
      ),
      createRemoteInlineImage(
        'https://resend.com/static/sample/logo.png',
        'company-logo'
      )
    ]

    // Validate that all references have corresponding attachments
    const validation = validateInlineImageReferences(html, attachments)
    
    if (!validation.isValid) {
      console.warn('⚠️ Validation issues found:')
      if (validation.missingContentIds.length > 0) {
        console.warn('Missing attachments for:', validation.missingContentIds)
      }
      if (validation.unusedContentIds.length > 0) {
        console.warn('Unused attachments:', validation.unusedContentIds)
      }
    } else {
      console.log('✅ All inline image references are valid')
    }

    // Extract contentIds from HTML (for debugging)
    const referencedIds = extractContentIdsFromHtml(html)
    console.log('ContentIds found in HTML:', referencedIds)

    const result = await inbound.emails.send({
      from: 'Products <products@yourdomain.com>',
      to: ['customer@example.com'],
      subject: 'Product Showcase - Validated Images',
      html,
      attachments
    })

    console.log('✅ Validated email sent:', result.id)
    return result
  } catch (error) {
    console.error('❌ Error:', error)
    throw error
  }
}

/**
 * Example 5: Handling validation errors gracefully
 */
async function demonstrateValidationErrors() {
  try {
    console.log('\n🔍 Testing validation utilities...\n')

    // Test contentId validation
    console.log('Valid contentId "logo-123":', validateContentId('logo-123'))
    console.log('Invalid contentId (too long):', validateContentId('a'.repeat(130)))
    console.log('Invalid contentId (special chars):', validateContentId('logo@#$%'))

    // Test content type detection
    console.log('Content type for logo.png:', getContentTypeFromExtension('logo.png'))
    console.log('Content type for image.jpg:', getContentTypeFromExtension('image.jpg'))
    console.log('Content type for unknown.xyz:', getContentTypeFromExtension('unknown.xyz'))

    // Test HTML parsing
    const testHtml = '<p>Image: <img src="cid:test-image"/> and <img src="cid:another-image"/></p>'
    console.log('ContentIds in HTML:', extractContentIdsFromHtml(testHtml))

    // Test validation with mismatched references
    const mismatchedValidation = validateInlineImageReferences(
      '<p><img src="cid:missing-image"/></p>',
      [{ contentId: 'unused-image' }]
    )
    console.log('Mismatched validation result:', mismatchedValidation)

  } catch (error) {
    console.error('❌ Validation error:', error)
  }
}

/**
 * Example 6: Error handling with utilities
 */
async function demonstrateErrorHandling() {
  try {
    // This will throw an error due to invalid contentId
    createRemoteInlineImage(
      'https://example.com/image.png',
      'invalid@contentId', // Invalid characters
      'image.png'
    )
  } catch (error) {
    console.log('✅ Caught expected error for invalid contentId:', error.message)
  }

  try {
    // This will throw an error due to invalid base64
    createBase64InlineImage(
      'not-base64-content',
      'image.png',
      'valid-id'
    )
  } catch (error) {
    console.log('✅ Caught expected error for invalid base64:', error.message)
  }
}

// Example usage
async function runUtilityExamples() {
  console.log('🚀 Running Inline Images Utility Examples...\n')

  try {
    // Run examples
    await sendEmailWithUtilityRemoteImage()
    await sendEmailWithUtilityBase64Image()
    await sendEmailWithGeneratedContentIds()
    await sendEmailWithValidation()
    
    // Demonstrate validation utilities
    await demonstrateValidationErrors()
    await demonstrateErrorHandling()

    console.log('\n✅ All utility examples completed successfully!')
  } catch (error) {
    console.error('\n❌ Utility examples failed:', error)
  }
}

// Export functions for individual use
export {
  sendEmailWithUtilityRemoteImage,
  sendEmailWithUtilityBase64Image,
  sendEmailWithGeneratedContentIds,
  sendEmailWithValidation,
  demonstrateValidationErrors,
  demonstrateErrorHandling
}

// Run examples if this file is executed directly
if (require.main === module) {
  runUtilityExamples()
}
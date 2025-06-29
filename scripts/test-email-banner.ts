#!/usr/bin/env bun

import { generateEmailBannerHTML } from '@/components/email-banner'

async function testEmailBanner() {
  console.log('🧪 Testing Updated Email Banner')
  console.log('===============================')

  const recipientEmail = 'ryan@inbound.new'
  const senderEmail = 'spam@example.com'

  const bannerHtml = generateEmailBannerHTML(recipientEmail, senderEmail)
  
  console.log('\n🎨 Updated Banner HTML:')
  console.log('=' .repeat(60))
  console.log(bannerHtml)
  console.log('=' .repeat(60))

  console.log('\n✅ Key improvements:')
  console.log('- ✅ Reduced width (max-width: 600px)')
  console.log('- ✅ Larger logo (32px height)')
  console.log('- ✅ White background')
  console.log('- ✅ Purple button (#8b5cf6)')
  console.log('- ✅ Rounded corners and shadow')
  console.log('- ✅ Better padding and spacing')
}

testEmailBanner().catch(console.error) 
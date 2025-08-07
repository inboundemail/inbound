import { ImageResponse } from 'next/og'
import { promises as fs } from 'fs'
import path from 'path'

export const runtime = 'nodejs'

export const alt = 'Inbound Changelog - All the latest updates, improvements, and fixes'
export const size = {
  width: 1200,
  height: 630,
}
export const contentType = 'image/png'

export default async function Image() {
  // Load Outfit font from public directory
  const outfitMedium = await fs.readFile(
    path.join(process.cwd(), 'public/Outfit-Medium.ttf')
  )

  return new ImageResponse(
    (
      <div
        style={{
          height: '630px',
          width: '1200px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          justifyContent: 'flex-end',
          backgroundColor: '#0a0b10',
          backgroundImage: `url(${process.env.NODE_ENV === 'production' ? 'https://inbound.new' : 'http://localhost:3000'}/inbound-hero.png)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          position: 'relative',
        }}
      >
        {/* Dark overlay for better text readability */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(10, 11, 16, 0.3)',
            display: 'flex',
          }}
        />
        
        {/* Content container */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-start',
            justifyContent: 'flex-start',
            zIndex: 1,
            padding: '20px',
            textAlign: 'left',
          }}
        >
          {/* Main title */}
          <div
            style={{
              fontSize: '120px',
              fontWeight: '500',
              color: 'white',
              marginBottom: '24px',
              letterSpacing: '-0.02em',
              fontFamily: 'Outfit',
            }}
          >
            the inbound changelog
          </div>
          
          {/* Subtitle */}
          <div
            style={{
              fontSize: '40px',
              color: 'rgba(255, 255, 255, 0.8)',
              marginBottom: '40px',
              maxWidth: '600px',
              lineHeight: '1.4',
              fontFamily: 'Outfit',
            }}
          >
            all the latest updates, improvements, and fixes to inbound
          </div>
          
          {/* Inbound branding */}
          <div
            style={{
              fontSize: '40px',
              fontWeight: '600',
              color: '#ffffff',
              letterSpacing: '-0.01em',
              fontFamily: 'Outfit',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <img src="https://inbound.new/inbound-logo-3.png" alt="Inbound" style={{ width: '39px', height: '39px', marginRight: '10px' }} />
            inbound
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: 'Outfit',
          data: outfitMedium,
          style: 'normal',
          weight: 500,
        },
      ],
    }
  )
} 
/**
 * React Email Component Tests for Inbound Email SDK
 * Tests React Email component rendering functionality for email sending
 * Uses @react-email/components for realistic email templates
 */

import { describe, test, expect, beforeAll } from 'bun:test'
import * as React from 'react'
import { 
  Html, 
  Head, 
  Body, 
  Container, 
  Section, 
  Row, 
  Column, 
  Heading, 
  Text, 
  Link, 
  Button, 
  Img,
  Hr,
  Preview
} from '@react-email/components'
import { Inbound } from '../src/index'
import type { PostEmailsResponse, ApiResponse } from '../src/types'

// Test configuration
const TEST_API_KEY = "uHpoGGrqCpinyLltyiOAkqKsqzOuTbyoxnueruOyUQpfuQDJefSHSdQlsIghaHIH"
const TEST_FROM_EMAIL = 'agent@inbnd.dev'
const TEST_TO_EMAIL = 'inboundemaildotnew@gmail.com'
const API_BASE_URL = 'http://localhost:3000'

// Initialize SDK client
const inbound = new Inbound(TEST_API_KEY, `${API_BASE_URL}/api/v2`)

// React Email Components for testing
const WelcomeEmail = ({ userName = 'User' }: { userName?: string }) => {
  return React.createElement(Html, {}, [
    React.createElement(Head, { key: 'head' }),
    React.createElement(Preview, { key: 'preview', children: `Welcome to our service, ${userName}!` }),
    React.createElement(Body, { 
      key: 'body',
      style: { 
        backgroundColor: '#ffffff',
        fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif'
      }
    }, [
      React.createElement(Container, { 
        key: 'container',
        style: { margin: '0 auto', padding: '20px 0 48px' }
      }, [
        React.createElement(Heading, { 
          key: 'heading',
          style: { fontSize: '32px', lineHeight: '1.3', fontWeight: '700', color: '#484848' }
        }, `Welcome, ${userName}!`),
        React.createElement(Text, { 
          key: 'intro',
          style: { fontSize: '18px', lineHeight: '1.4', color: '#484848' }
        }, 'Thank you for joining our platform. We\'re excited to have you on board!'),
        React.createElement(Section, { key: 'cta-section', style: { textAlign: 'center', margin: '32px 0' } }, [
          React.createElement(Button, {
            key: 'cta-button',
            href: 'https://example.com/get-started',
            style: {
              backgroundColor: '#007bff',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '16px',
              textDecoration: 'none',
              textAlign: 'center',
              display: 'block',
              padding: '12px 20px'
            }
          }, 'Get Started')
        ]),
        React.createElement(Hr, { key: 'divider', style: { borderColor: '#cccccc', margin: '20px 0' } }),
        React.createElement(Text, { 
          key: 'footer',
          style: { color: '#8898aa', fontSize: '14px' }
        }, 'Best regards, The Team')
      ])
    ])
  ])
}

const NewsletterEmail = ({ articles }: { articles: Array<{ title: string, excerpt: string, url: string }> }) => {
  return React.createElement(Html, {}, [
    React.createElement(Head, { key: 'head' }),
    React.createElement(Preview, { key: 'preview', children: 'Your weekly newsletter is here!' }),
    React.createElement(Body, { 
      key: 'body',
      style: { backgroundColor: '#f6f9fc', fontFamily: 'Arial, sans-serif' }
    }, [
      React.createElement(Container, { 
        key: 'container',
        style: { backgroundColor: '#ffffff', margin: '0 auto', padding: '20px', maxWidth: '600px' }
      }, [
        React.createElement(Heading, { 
          key: 'title',
          style: { color: '#333', textAlign: 'center', marginBottom: '30px' }
        }, '📧 Weekly Newsletter'),
        React.createElement(Text, { 
          key: 'intro',
          style: { fontSize: '16px', lineHeight: '1.5', color: '#555' }
        }, 'Here are this week\'s top articles:'),
        ...articles.map((article, index) => 
          React.createElement(Section, { 
            key: `article-${index}`,
            style: { 
              border: '1px solid #e1e5e9', 
              borderRadius: '8px', 
              padding: '20px', 
              marginBottom: '20px' 
            }
          }, [
            React.createElement(Heading, { 
              key: `title-${index}`,
              as: 'h3',
              style: { fontSize: '20px', color: '#333', marginBottom: '10px' }
            }, article.title),
            React.createElement(Text, { 
              key: `excerpt-${index}`,
              style: { fontSize: '14px', color: '#666', marginBottom: '15px' }
            }, article.excerpt),
            React.createElement(Link, {
              key: `link-${index}`,
              href: article.url,
              style: { color: '#007bff', textDecoration: 'none', fontWeight: 'bold' }
            }, 'Read More →')
          ])
        ),
        React.createElement(Hr, { key: 'divider', style: { margin: '30px 0' } }),
        React.createElement(Text, { 
          key: 'footer',
          style: { textAlign: 'center', color: '#8898aa', fontSize: '12px' }
        }, 'You received this email because you subscribed to our newsletter.')
      ])
    ])
  ])
}

const TransactionalEmail = ({ 
  customerName, 
  orderNumber, 
  orderTotal, 
  items 
}: { 
  customerName: string
  orderNumber: string
  orderTotal: string
  items: Array<{ name: string, quantity: number, price: string }>
}) => {
  return React.createElement(Html, {}, [
    React.createElement(Head, { key: 'head' }),
    React.createElement(Preview, { key: 'preview', children: `Order confirmation #${orderNumber}` }),
    React.createElement(Body, { 
      key: 'body',
      style: { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
    }, [
      React.createElement(Container, { 
        key: 'container',
        style: { margin: '0 auto', padding: '20px', maxWidth: '600px' }
      }, [
        React.createElement(Section, { key: 'header', style: { textAlign: 'center', marginBottom: '32px' } }, [
          React.createElement(Heading, { 
            key: 'title',
            style: { color: '#333', fontSize: '28px' }
          }, '✅ Order Confirmed'),
          React.createElement(Text, { 
            key: 'subtitle',
            style: { color: '#666', fontSize: '16px' }
          }, `Thank you for your order, ${customerName}!`)
        ]),
        React.createElement(Section, { key: 'order-details', style: { marginBottom: '32px' } }, [
          React.createElement(Text, { 
            key: 'order-number',
            style: { fontSize: '18px', fontWeight: 'bold', color: '#333' }
          }, `Order #${orderNumber}`),
          React.createElement(Hr, { key: 'divider1', style: { margin: '16px 0' } }),
          ...items.map((item, index) => 
            React.createElement(Row, { key: `item-${index}`, style: { marginBottom: '8px' }, children: [
              React.createElement(Column, { key: `name-${index}` }, [
                React.createElement(Text, { key: `text-name-${index}`, style: { margin: '0' } }, `${item.name} (x${item.quantity})`)
              ]),
              React.createElement(Column, { key: `price-${index}`, style: { textAlign: 'right' } }, [
                React.createElement(Text, { key: `text-price-${index}`, style: { margin: '0', fontWeight: 'bold' } }, item.price)
              ])
            ]})
          ),
          React.createElement(Hr, { key: 'divider2', style: { margin: '16px 0' } }),
          React.createElement(Row, { key: 'total-row', children: [
            React.createElement(Column, { key: 'total-label' }, [
              React.createElement(Text, { key: 'total-text-label', style: { margin: '0', fontSize: '18px', fontWeight: 'bold' } }, 'Total:')
            ]),
            React.createElement(Column, { key: 'total-amount', style: { textAlign: 'right' } }, [
              React.createElement(Text, { 
                key: 'total-text-amount',
                style: { margin: '0', fontSize: '18px', fontWeight: 'bold', color: '#007bff' } 
              }, orderTotal)
            ])
          ]})
        ]),
        React.createElement(Section, { key: 'cta', style: { textAlign: 'center' } }, [
          React.createElement(Button, {
            key: 'track-button',
            href: `https://example.com/orders/${orderNumber}`,
            style: {
              backgroundColor: '#28a745',
              borderRadius: '6px',
              color: '#fff',
              fontSize: '16px',
              textDecoration: 'none',
              textAlign: 'center',
              display: 'inline-block',
              padding: '12px 24px'
            }
          }, 'Track Your Order')
        ])
      ])
    ])
  ])
}

describe('🚀 React Email Component Tests', () => {

  describe('📧 Basic React Email Components', () => {
    
    test('should send email with React Email welcome template', async () => {
      console.log('📧 Testing React Email welcome template via SDK')
      
      const { data, error } = await inbound.emails.send({
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - React Email Welcome Template',
        react: React.createElement(WelcomeEmail, { userName: 'John Doe' })
      })

      expect(error).toBeUndefined()
      expect(data).toBeDefined()
      
      if (data) {
        expect(data.id).toBeDefined()
        expect(typeof data.id).toBe('string')
        console.log('✅ React Email welcome template sent with ID:', data.id)
      }
    })

    test('should send email with React Email newsletter template', async () => {
      console.log('📧 Testing React Email newsletter template via SDK')
      
      const sampleArticles = [
        {
          title: 'Getting Started with React Email',
          excerpt: 'Learn how to create beautiful emails using React components.',
          url: 'https://example.com/react-email-guide'
        },
        {
          title: 'Email Best Practices',
          excerpt: 'Tips and tricks for creating emails that work across all clients.',
          url: 'https://example.com/email-best-practices'
        }
      ]
      
      const { data, error } = await inbound.emails.send({
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - React Email Newsletter',
        react: React.createElement(NewsletterEmail, { articles: sampleArticles })
      })

      expect(error).toBeUndefined()
      expect(data).toBeDefined()
      
      if (data) {
        expect(data.id).toBeDefined()
        console.log('✅ React Email newsletter template sent with ID:', data.id)
      }
    })

    test('should send email with React Email transactional template', async () => {
      console.log('📧 Testing React Email transactional template via SDK')
      
      const orderData = {
        customerName: 'Jane Smith',
        orderNumber: 'ORD-2024-001',
        orderTotal: '$149.99',
        items: [
          { name: 'Premium T-Shirt', quantity: 2, price: '$59.98' },
          { name: 'Shipping', quantity: 1, price: '$9.99' },
          { name: 'Tax', quantity: 1, price: '$12.00' }
        ]
      }
      
      const { data, error } = await inbound.emails.send({
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: `Order Confirmation #${orderData.orderNumber}`,
        react: React.createElement(TransactionalEmail, orderData)
      })

      expect(error).toBeUndefined()
      expect(data).toBeDefined()
      
      if (data) {
        expect(data.id).toBeDefined()
        console.log('✅ React Email transactional template sent with ID:', data.id)
      }
    })
  })

  describe('🔧 React Email Advanced Features', () => {

    test('should send React Email with custom styling and preview', async () => {
      console.log('📧 Testing React Email with advanced features')
      
      const AdvancedEmail = () => {
        return React.createElement(Html, {}, [
          React.createElement(Head, { key: 'head' }),
          React.createElement(Preview, { key: 'preview', children: 'This email showcases advanced React Email features' }),
          React.createElement(Body, { 
            key: 'body',
            style: { 
              backgroundColor: '#f0f0f0',
              fontFamily: 'Georgia, serif'
            }
          }, [
            React.createElement(Container, { 
              key: 'container',
              style: { 
                backgroundColor: '#ffffff',
                margin: '0 auto',
                padding: '40px',
                maxWidth: '600px',
                boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
              }
            }, [
              React.createElement(Section, { key: 'header', style: { textAlign: 'center', marginBottom: '40px' } }, [
                React.createElement(Heading, { 
                  key: 'title',
                  style: { 
                    color: '#2c3e50',
                    fontSize: '32px',
                    fontWeight: 'bold',
                    marginBottom: '16px'
                  }
                }, '🎨 Advanced Email Design'),
                React.createElement(Text, { 
                  key: 'subtitle',
                  style: { 
                    color: '#7f8c8d',
                    fontSize: '18px',
                    fontStyle: 'italic'
                  }
                }, 'Showcasing React Email capabilities')
              ]),
              React.createElement(Section, { key: 'content', style: { marginBottom: '32px' } }, [
                React.createElement(Row, { key: 'feature-row', children: [
                  React.createElement(Column, { key: 'col1', style: { padding: '0 10px' } }, [
                    React.createElement(Text, { 
                      key: 'feature1',
                      style: { 
                        backgroundColor: '#e8f4fd',
                        padding: '20px',
                        borderRadius: '8px',
                        textAlign: 'center'
                      }
                    }, '📱 Responsive Design')
                  ]),
                  React.createElement(Column, { key: 'col2', style: { padding: '0 10px' } }, [
                    React.createElement(Text, { 
                      key: 'feature2',
                      style: { 
                        backgroundColor: '#f0f9ff',
                        padding: '20px',
                        borderRadius: '8px',
                        textAlign: 'center'
                      }
                    }, '🎯 Cross-Client Support')
                  ])
                ]})
              ]),
              React.createElement(Hr, { key: 'divider', style: { borderColor: '#bdc3c7', margin: '32px 0' } }),
              React.createElement(Section, { key: 'cta', style: { textAlign: 'center' } }, [
                React.createElement(Button, {
                  key: 'cta-button',
                  href: 'https://react.email',
                  style: {
                    background: 'linear-gradient(45deg, #667eea 0%, #764ba2 100%)',
                    borderRadius: '25px',
                    color: '#ffffff',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    textDecoration: 'none',
                    padding: '15px 30px',
                    display: 'inline-block'
                  }
                }, 'Learn More About React Email')
              ])
            ])
          ])
        ])
      }
      
      const { data, error } = await inbound.emails.send({
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - Advanced React Email Features',
        react: React.createElement(AdvancedEmail),
        headers: {
          'X-Email-Type': 'react-email-advanced'
        }
      })

      expect(error).toBeUndefined()
      expect(data).toBeDefined()
      
      if (data) {
        expect(data.id).toBeDefined()
        console.log('✅ Advanced React Email template sent with ID:', data.id)
      }
    })

    test('should send React Email with attachments', async () => {
      console.log('📧 Testing React Email with attachments')
      
      const EmailWithAttachment = () => {
        return React.createElement(Html, {}, [
          React.createElement(Head, { key: 'head' }),
          React.createElement(Body, { key: 'body', style: { fontFamily: 'Arial, sans-serif' } }, [
            React.createElement(Container, { key: 'container', style: { padding: '20px' } }, [
              React.createElement(Heading, { key: 'title' }, 'Email with Attachment'),
              React.createElement(Text, { key: 'content' }, 
                'This email was created using React Email components and includes an attachment.'
              ),
              React.createElement(Text, { key: 'note', style: { color: '#666', fontSize: '14px' } }, 
                'Please find the attached document for your reference.'
              )
            ])
          ])
        ])
      }
      
      const { data, error } = await inbound.emails.send({
        from: TEST_FROM_EMAIL,
        to: TEST_TO_EMAIL,
        subject: 'SDK Test - React Email with Attachment',
        react: React.createElement(EmailWithAttachment),
        attachments: [
          {
            content: Buffer.from('React Email attachment content').toString('base64'),
            filename: 'react-email-attachment.txt',
            contentType: 'text/plain'
          }
        ]
      })

      expect(error).toBeUndefined()
      expect(data).toBeDefined()
      
      if (data) {
        expect(data.id).toBeDefined()
        console.log('✅ React Email with attachment sent with ID:', data.id)
      }
    })
  })

  describe('❌ React Email Error Handling', () => {

    test('should handle React Email component with invalid props', async () => {
      console.log('📧 Testing React Email error handling')
      
      const InvalidEmail = () => {
        // This will cause an error during rendering
        throw new Error('Invalid React Email component')
      }
      
      try {
        const { data, error } = await inbound.emails.send({
          from: TEST_FROM_EMAIL,
          to: TEST_TO_EMAIL,
          subject: 'SDK Test - Invalid React Email Component',
          react: React.createElement(InvalidEmail)
        })

        // Should not reach here
        expect(true).toBe(false)
      } catch (error) {
        expect(error).toBeDefined()
        expect(error instanceof Error).toBe(true)
        expect((error as Error).message).toContain('Failed to process React component')
        
        console.log('✅ Invalid React Email component properly handled with error:', (error as Error).message)
      }
    })
  })
})

describe('🧪 React Email Rendering Utilities', () => {

  test('should render React Email components to valid HTML', async () => {
    console.log('🔧 Testing React Email component rendering')
    
    const { renderReactToHtml } = await import('../src/react-renderer')
    
    const simpleEmail = React.createElement(Html, {}, [
      React.createElement(Body, { key: 'body' }, [
        React.createElement(Container, { key: 'container' }, [
          React.createElement(Text, { key: 'text' }, 'Hello from React Email!')
        ])
      ])
    ])
    
    const html = renderReactToHtml(simpleEmail)
    
    expect(html).toContain('Hello from React Email!')
    expect(html).toContain('<body')
    expect(html).toContain('</body>')
    
    console.log('✅ React Email component rendered successfully')
    console.log('📄 Sample rendered HTML:', html.substring(0, 200) + '...')
  })
})
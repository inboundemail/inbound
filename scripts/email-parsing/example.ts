import { parseEmail } from './parse';
import * as fs from 'fs';
import * as path from 'path';

interface ParsedEmailData {
  sender: { name?: string; address?: string } | undefined;
  recipients: Array<{ name?: string; address?: string }>;
  subject: string;
  date: Date | undefined;
  textContent: string | undefined;
  htmlContent: string | undefined;
  attachmentCount: number;
  messageId: string | undefined;
  hasSecurityHeaders: {
    spf: boolean;
    dkim: boolean;
    dmarc: boolean;
  };
}

async function findEmailFiles(dir: string): Promise<string[]> {
  const emailFiles: string[] = [];
  
  try {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        // Recursively search subdirectories
        const subFiles = await findEmailFiles(fullPath);
        emailFiles.push(...subFiles);
      } else if (stat.isFile() && item !== 'AMAZON_SES_SETUP_NOTIFICATION') {
        // Add valid email files
        emailFiles.push(fullPath);
      }
    }
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error);
  }
  
  return emailFiles;
}

async function parseEmailFile(filePath: string): Promise<ParsedEmailData | null> {
  try {
    const emailContent = fs.readFileSync(filePath, 'utf-8');
    const emailData = await parseEmail(emailContent);
    
    // Check for specific headers
    const authResults = emailData.headers['authentication-results'];
    const dmarcStatus = typeof authResults === 'string' && authResults.includes('dmarc=pass');
    
    return {
      sender: emailData.from?.addresses[0] ? {
        name: emailData.from.addresses[0].name || undefined,
        address: emailData.from.addresses[0].address || undefined
      } : undefined,
      recipients: emailData.to?.addresses?.map(addr => ({
        name: addr.name || undefined,
        address: addr.address || undefined
      })) || [],
      subject: emailData.subject || '',
      date: emailData.date,
      textContent: emailData.textBody || '',
      htmlContent: emailData.htmlBody || '',
      attachmentCount: emailData.attachments.length,
      messageId: emailData.messageId,
      hasSecurityHeaders: {
        spf: !!emailData.headers['received-spf'],
        dkim: !!emailData.headers['dkim-signature'],
        dmarc: dmarcStatus
      }
    };
  } catch (error) {
    console.error(`Failed to parse email file ${filePath}:`, error);
    return null;
  }
}

function generateEmailHTML(emails: Array<{ filePath: string; data: ParsedEmailData }>): string {
  const emailsHTML = emails.map(({ filePath, data }, index) => {
    const senderDisplay = data.sender 
      ? `${data.sender.name || 'Unknown'} &lt;${data.sender.address}&gt;`
      : 'Unknown Sender';
    
    const recipientsDisplay = data.recipients
      .map(r => `${r.name || 'Unknown'} &lt;${r.address}&gt;`)
      .join(', ') || 'Unknown Recipients';
    
    const dateDisplay = data.date 
      ? data.date.toLocaleString()
      : 'Unknown Date';
    
    const emailContent = data.htmlContent || 
      (data.textContent ? `<pre style="white-space: pre-wrap; font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;">${data.textContent.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>` : 
      '<p><em>No content available</em></p>');
    
    return `
      <div class="email-slide" data-index="${index}">
        <div class="email-header">
          <h2>${data.subject || 'No Subject'}</h2>
          <div class="email-meta">
            <div class="meta-row">
              <span class="meta-label">From:</span>
              <span class="meta-value">${senderDisplay}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">To:</span>
              <span class="meta-value">${recipientsDisplay}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">Date:</span>
              <span class="meta-value">${dateDisplay}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">File:</span>
              <span class="meta-value file-name">${path.basename(filePath)}</span>
            </div>
            ${data.attachmentCount > 0 ? `<div class="meta-row"><span class="meta-label">Attachments:</span><span class="meta-value">${data.attachmentCount}</span></div>` : ''}
          </div>
        </div>
        <div class="email-content">
          ${emailContent}
        </div>
      </div>
    `;
  }).join('\n');

  return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Email Viewer - ${emails.length} Emails</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            background: #f8f9fa;
            color: #2c3e50;
            line-height: 1.6;
            overflow-x: hidden;
        }
        
        .viewer-container {
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        
        .header {
            background: #ffffff;
            padding: 20px;
            border-bottom: 1px solid #e9ecef;
            text-align: center;
            position: relative;
        }
        
        .header h1 {
            font-size: 24px;
            font-weight: 600;
            color: #2c3e50;
            margin-bottom: 8px;
        }
        
        .counter {
            font-size: 14px;
            color: #6c757d;
            font-weight: 500;
        }
        
        .email-viewer {
            flex: 1;
            position: relative;
            overflow: hidden;
        }
        
        .email-slide {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: #ffffff;
            display: none;
            flex-direction: column;
            opacity: 0;
            transform: translateX(100px);
            transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        .email-slide.active {
            opacity: 1;
            transform: translateX(0);
            display: flex;
        }
        
        .email-header {
            padding: 30px;
            background: #ffffff;
            border-bottom: 1px solid #e9ecef;
            flex-shrink: 0;
        }
        
        .email-header h2 {
            font-size: 20px;
            font-weight: 600;
            color: #2c3e50;
            margin-bottom: 20px;
            line-height: 1.4;
        }
        
        .email-meta {
            display: grid;
            gap: 12px;
        }
        
        .meta-row {
            display: flex;
            align-items: flex-start;
            gap: 16px;
        }
        
        .meta-label {
            font-weight: 600;
            color: #495057;
            min-width: 80px;
            font-size: 14px;
        }
        
        .meta-value {
            color: #6c757d;
            font-size: 14px;
            flex: 1;
            word-break: break-word;
        }
        
        .file-name {
            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
            background: #f8f9fa;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 12px;
            color: #495057;
        }
        
        .email-content {
            flex: 1;
            padding: 30px;
            overflow-y: auto;
            background: #ffffff;
        }
        
        .email-content pre {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 8px;
            overflow-x: auto;
            border-left: 4px solid #3498db;
            font-size: 13px;
            line-height: 1.5;
        }
        
        .nav-button {
            position: absolute;
            top: 50%;
            transform: translateY(-50%);
            background: #ffffff;
            border: 1px solid #e9ecef;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            font-size: 18px;
            color: #495057;
            transition: all 0.2s ease;
            z-index: 10;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
        }
        
        .nav-button:hover {
            background: #f8f9fa;
            border-color: #dee2e6;
            transform: translateY(-50%) scale(1.05);
        }
        
        .nav-button:active {
            transform: translateY(-50%) scale(0.95);
        }
        
        .nav-button.disabled {
            opacity: 0.3;
            cursor: not-allowed;
            pointer-events: none;
        }
        
        .nav-prev {
            left: 20px;
        }
        
        .nav-next {
            right: 20px;
        }
        
        .progress-bar {
            position: absolute;
            bottom: 0;
            left: 0;
            height: 3px;
            background: #3498db;
            transition: width 0.3s ease;
        }
        
        .keyboard-hint {
            position: absolute;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 8px 16px;
            border-radius: 20px;
            font-size: 12px;
            opacity: 0.7;
            pointer-events: none;
        }
        
        @media (max-width: 768px) {
            .email-header {
                padding: 20px;
            }
            
            .email-content {
                padding: 20px;
            }
            
            .nav-button {
                width: 40px;
                height: 40px;
                font-size: 16px;
            }
            
            .nav-prev {
                left: 10px;
            }
            
            .nav-next {
                right: 10px;
            }
        }
    </style>
</head>
<body>
    <div class="viewer-container">
        <div class="header">
            <h1>📧 Email Viewer</h1>
            <div class="counter">
                <span id="current-email">1</span> of ${emails.length}
            </div>
            <div class="progress-bar" id="progress-bar"></div>
        </div>
        
        <div class="email-viewer" id="email-viewer">
            ${emailsHTML}
            
            <button class="nav-button nav-prev" id="prev-btn" onclick="navigateEmail(-1)">
                ←
            </button>
            
            <button class="nav-button nav-next" id="next-btn" onclick="navigateEmail(1)">
                →
            </button>
        </div>
        
        <div class="keyboard-hint">
            Use ← → arrow keys or click buttons to navigate
        </div>
    </div>

    <script>
        let currentEmailIndex = 0;
        const totalEmails = ${emails.length};
        
        function updateUI() {
            // Update counter
            document.getElementById('current-email').textContent = currentEmailIndex + 1;
            
            // Update progress bar
            const progressPercent = ((currentEmailIndex + 1) / totalEmails) * 100;
            document.getElementById('progress-bar').style.width = progressPercent + '%';
            
            // Update navigation buttons
            const prevBtn = document.getElementById('prev-btn');
            const nextBtn = document.getElementById('next-btn');
            
            prevBtn.classList.toggle('disabled', currentEmailIndex === 0);
            nextBtn.classList.toggle('disabled', currentEmailIndex === totalEmails - 1);
            
            // Show current email - hide all first, then show current
            const slides = document.querySelectorAll('.email-slide');
            slides.forEach((slide, index) => {
                slide.classList.remove('active');
                slide.style.display = 'none';
            });
            
            // Show the current slide
            const currentSlide = slides[currentEmailIndex];
            if (currentSlide) {
                currentSlide.style.display = 'flex';
                // Force reflow to ensure display change takes effect
                currentSlide.offsetHeight;
                currentSlide.classList.add('active');
            }
        }
        
        function navigateEmail(direction) {
            const newIndex = currentEmailIndex + direction;
            
            if (newIndex >= 0 && newIndex < totalEmails) {
                currentEmailIndex = newIndex;
                updateUI();
            }
        }
        
        // Keyboard navigation
        document.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowLeft') {
                e.preventDefault();
                navigateEmail(-1);
            } else if (e.key === 'ArrowRight') {
                e.preventDefault();
                navigateEmail(1);
            }
        });
        
        // Initialize - show first email
        document.addEventListener('DOMContentLoaded', () => {
            updateUI();
        });
        
        // Also initialize immediately in case DOMContentLoaded already fired
        updateUI();
        
        // Hide keyboard hint after 5 seconds
        setTimeout(() => {
            const hint = document.querySelector('.keyboard-hint');
            if (hint) {
                hint.style.opacity = '0';
                hint.style.transition = 'opacity 0.5s ease';
            }
        }, 5000);
    </script>
</body>
</html>
  `;
}

async function generateEmailViewer() {
  try {
    const emailsDir = path.join(process.cwd(), 'emails', 'emails');
    
    if (!fs.existsSync(emailsDir)) {
      throw new Error(`Emails directory not found: ${emailsDir}`);
    }
    
    console.log('🔍 Searching for email files...');
    const emailFiles = await findEmailFiles(emailsDir);
    console.log(`📁 Found ${emailFiles.length} email files`);
    
    if (emailFiles.length === 0) {
      console.log('⚠️  No email files found');
      return;
    }
    
    console.log('📧 Parsing emails...');
    const parsedEmails: Array<{ filePath: string; data: ParsedEmailData }> = [];
    
    for (const filePath of emailFiles) {
      console.log(`  Processing: ${path.basename(filePath)}`);
      const emailData = await parseEmailFile(filePath);
      
      if (emailData) {
        parsedEmails.push({ filePath, data: emailData });
      }
    }
    
    console.log(`✅ Successfully parsed ${parsedEmails.length} emails`);
    
    // Generate HTML
    console.log('🎨 Generating HTML viewer...');
    const html = generateEmailHTML(parsedEmails);
    
    // Write HTML file
    const outputPath = path.join(process.cwd(), 'email-viewer.html');
    fs.writeFileSync(outputPath, html, 'utf-8');
    
    console.log(`🎉 Email viewer generated: ${outputPath}`);
    console.log(`📖 Open the file in your browser to view the emails`);
    
    return {
      totalFiles: emailFiles.length,
      parsedEmails: parsedEmails.length,
      outputPath
    };
    
  } catch (error) {
    console.error('❌ Failed to generate email viewer:', error);
    throw error;
  }
}

// Run the example
if (require.main === module) {
  generateEmailViewer()
    .then((result) => {
      console.log('\n✅ Email viewer generation completed successfully!');
      if (result) {
        console.log(`📊 Stats: ${result.parsedEmails}/${result.totalFiles} emails processed`);
      }
    })
    .catch((error) => {
      console.error('❌ Email viewer generation failed:', error);
      process.exit(1);
    });
}

export { generateEmailViewer };
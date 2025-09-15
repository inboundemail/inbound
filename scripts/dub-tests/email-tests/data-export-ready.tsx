import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components";

export default function DataExportReady({
  userName = "Jennifer Martinez",
  exportType = "Customer Data",
  fileName = "customer-data-2024-01-15.csv",
  fileSize = "2.4 MB",
  recordCount = "1,247",
  downloadUrl = "https://app.example.com/exports/download/abc123",
  expirationHours = 72,
  requestedAt = "2024-01-15T10:30:00Z",
  appName = "DataVault",
  logoUrl = "https://placehold.co/120x36?text=DataVault",
}: {
  userName: string;
  exportType: string;
  fileName: string;
  fileSize: string;
  recordCount: string;
  downloadUrl: string;
  expirationHours?: number;
  requestedAt: string;
  appName: string;
  logoUrl: string;
}) {
  const requestedDate = new Date(requestedAt).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const expirationDate = new Date(Date.now() + expirationHours * 60 * 60 * 1000).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return (
    <Html>
      <Head />
      <Preview>Your {exportType} export is ready for download</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-white font-sans">
          <Container className="mx-auto my-10 max-w-[600px] rounded border border-solid border-neutral-200 px-10 py-5">
            <Section className="mt-8">
              <Img src={logoUrl} height="36" alt={appName} className="mx-auto" />
            </Section>
            
            <Heading className="mx-0 my-7 p-0 text-xl font-semibold text-black">
              Your data export is ready! 📊
            </Heading>
            
            <Text className="mb-6 text-sm leading-6 text-gray-600">
              Hi {userName},
            </Text>
            
            <Text className="mb-6 text-sm leading-6 text-gray-600">
              Good news! The {exportType} export you requested on {requestedDate} has been processed and is ready for download.
            </Text>

            {/* Export Details */}
            <Section className="mb-6 rounded-lg border border-gray-200 p-4">
              <Text className="mb-3 text-base font-semibold text-black">
                Export Details
              </Text>
              
              <div className="mb-2 flex justify-between text-sm">
                <Text className="text-gray-600">Export Type:</Text>
                <Text className="font-medium text-black">{exportType}</Text>
              </div>
              
              <div className="mb-2 flex justify-between text-sm">
                <Text className="text-gray-600">File Name:</Text>
                <Text className="font-medium text-black">{fileName}</Text>
              </div>
              
              <div className="mb-2 flex justify-between text-sm">
                <Text className="text-gray-600">File Size:</Text>
                <Text className="font-medium text-black">{fileSize}</Text>
              </div>
              
              <div className="mb-2 flex justify-between text-sm">
                <Text className="text-gray-600">Records:</Text>
                <Text className="font-medium text-black">{recordCount}</Text>
              </div>
              
              <div className="mb-2 flex justify-between text-sm">
                <Text className="text-gray-600">Expires:</Text>
                <Text className="font-medium text-black">{expirationDate}</Text>
              </div>
            </Section>

            <Section className="mb-8 text-center">
              <Link
                className="inline-block rounded-lg bg-blue-600 px-6 py-3 text-center text-sm font-semibold text-white no-underline"
                href={downloadUrl}
              >
                Download Export
              </Link>
            </Section>

            {/* Security Notice */}
            <Section className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <Text className="mb-2 text-sm font-semibold text-amber-800">
                🔒 Security Notice
              </Text>
              <Text className="text-sm leading-5 text-amber-700">
                Your export contains sensitive data. The download link will expire in {expirationHours} hours for security. 
                Please download your file soon and store it securely.
              </Text>
            </Section>

            <Text className="mb-4 text-sm leading-6 text-gray-600">
              If the download button doesn't work, copy and paste this link into your browser:
            </Text>
            
            <Text className="mb-6 break-all rounded bg-gray-100 p-3 text-xs text-gray-800">
              {downloadUrl}
            </Text>

            <Hr className="mx-0 my-6 w-full border-t border-solid border-neutral-200" />

            {/* What's included */}
            <Section className="mb-6">
              <Text className="mb-3 text-base font-semibold text-black">
                What's included in your export
              </Text>
              
              <Text className="mb-3 text-sm leading-6 text-gray-600">
                Your {exportType} export contains:
              </Text>

              <ul className="mb-4 space-y-1">
                <li className="text-sm text-gray-600">
                  <span className="text-green-600">•</span> Complete record data from your requested date range
                </li>
                <li className="text-sm text-gray-600">
                  <span className="text-green-600">•</span> All associated metadata and custom fields
                </li>
                <li className="text-sm text-gray-600">
                  <span className="text-green-600">•</span> CSV format compatible with Excel and other tools
                </li>
                <li className="text-sm text-gray-600">
                  <span className="text-green-600">•</span> Data dictionary explaining each column
                </li>
              </ul>
            </Section>

            {/* Tips */}
            <Section className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <Text className="mb-2 text-sm font-semibold text-blue-800">
                💡 Pro Tips
              </Text>
              <Text className="text-sm leading-5 text-blue-700">
                • Open CSV files with Excel or Google Sheets for easy viewing
                <br />
                • Large files may take a moment to download completely
                <br />
                • Need a different format? Request a new export from your dashboard
              </Text>
            </Section>

            <Text className="mb-4 text-sm leading-6 text-gray-600">
              Having trouble with your download? Our support team is here to help - just reply to this email.
            </Text>

            <Text className="mb-4 text-xs leading-5 text-gray-500">
              This export was requested by {userName} on {requestedDate}.
            </Text>

            <Text className="mb-4 text-xs leading-5 text-gray-500">
              © 2024 {appName}. All rights reserved.
            </Text>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  );
}

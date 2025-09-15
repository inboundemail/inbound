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

export default function InvoicePaymentNotification({
  customerName = "Sarah Johnson",
  companyName = "Acme Corp", 
  invoiceNumber = "INV-2024-001",
  amount = "$99.00",
  currency = "USD",
  dueDate = "2024-02-15",
  servicePeriod = "January 2024",
  planName = "Professional Plan",
  invoiceUrl = "https://app.example.com/invoices/INV-2024-001",
  paymentUrl = "https://app.example.com/payment/INV-2024-001",
  logoUrl = "https://placehold.co/120x36?text=CloudSuite",
  appName = "CloudSuite",
}: {
  customerName: string;
  companyName?: string;
  invoiceNumber: string;
  amount: string;
  currency?: string;
  dueDate: string;
  servicePeriod: string;
  planName: string;
  invoiceUrl: string;
  paymentUrl: string;
  logoUrl: string;
  appName: string;
}) {
  return (
    <Html>
      <Head />
      <Preview>Invoice {invoiceNumber} - Payment Due {amount}</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-white font-sans">
          <Container className="mx-auto my-10 max-w-[600px] rounded border border-solid border-neutral-200 px-10 py-5">
            <Section className="mt-8">
              <Img src={logoUrl} height="36" alt={appName} className="mx-auto" />
            </Section>
            
            <Heading className="mx-0 my-7 p-0 text-xl font-semibold text-black">
              Invoice Ready - Payment Due
            </Heading>
            
            <Text className="mb-6 text-sm leading-6 text-gray-600">
              Hi {customerName},
            </Text>
            
            <Text className="mb-6 text-sm leading-6 text-gray-600">
              Your invoice for {companyName ? `${companyName}'s ` : "your "}{planName} subscription is ready.
            </Text>

            {/* Invoice Summary */}
            <Section className="mb-6 rounded-lg border border-gray-200 p-4">
              <Text className="mb-3 text-base font-semibold text-black">
                Invoice Summary
              </Text>
              
              <div className="mb-2 flex justify-between text-sm">
                <Text className="text-gray-600">Invoice Number:</Text>
                <Text className="font-medium text-black">{invoiceNumber}</Text>
              </div>
              
              <div className="mb-2 flex justify-between text-sm">
                <Text className="text-gray-600">Service Period:</Text>
                <Text className="font-medium text-black">{servicePeriod}</Text>
              </div>
              
              <div className="mb-2 flex justify-between text-sm">
                <Text className="text-gray-600">Plan:</Text>
                <Text className="font-medium text-black">{planName}</Text>
              </div>
              
              <div className="mb-2 flex justify-between text-sm">
                <Text className="text-gray-600">Due Date:</Text>
                <Text className="font-medium text-black">{new Date(dueDate).toLocaleDateString()}</Text>
              </div>
              
              <Hr className="my-3" />
              
              <div className="flex justify-between text-base">
                <Text className="font-semibold text-black">Total Amount:</Text>
                <Text className="font-bold text-black">{amount}</Text>
              </div>
            </Section>

            <Section className="mb-8 text-center">
              <Link
                className="mb-3 mr-3 inline-block rounded-lg bg-green-600 px-6 py-3 text-center text-sm font-semibold text-white no-underline"
                href={paymentUrl}
              >
                Pay Now
              </Link>
              <Link
                className="inline-block rounded-lg border border-gray-300 bg-white px-6 py-3 text-center text-sm font-semibold text-gray-700 no-underline"
                href={invoiceUrl}
              >
                View Invoice
              </Link>
            </Section>

            <Text className="mb-4 text-sm leading-6 text-gray-600">
              Payment will be automatically charged to your default payment method on file. 
              You can update your payment method in your account settings.
            </Text>

            <Section className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <Text className="mb-2 text-sm font-semibold text-blue-800">
                💳 Auto-Pay Available
              </Text>
              <Text className="text-sm leading-5 text-blue-700">
                Enable auto-pay to never worry about missed payments again. 
                Invoices will be automatically charged when due.
              </Text>
            </Section>

            <Text className="mb-4 text-sm leading-6 text-gray-600">
              Questions about your invoice? Contact our billing support team at billing@{appName.toLowerCase()}.com
            </Text>

            <Hr className="mx-0 my-6 w-full border-t border-solid border-neutral-200" />

            <Text className="mb-4 text-xs leading-5 text-gray-500">
              This invoice was sent to {customerName} for {companyName || "your account"}.
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

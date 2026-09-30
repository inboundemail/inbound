import {
  Body,
  CodeBlock,
  CodeInline,
  Container,
  Head,
  Html,
  Link,
  Preview,
  Tailwind,
  Text,
} from "@react-email/components";

interface DnsRecord {
  type: "TXT" | "MX" | string;
  name: string;
  value: string;
  isVerified?: boolean;
}

interface DnsSetupInstructionsEmailProps {
  recipientName?: string;
  recipientEmail: string;
  domain: string;
  dnsRecords: DnsRecord[];
  provider?: string;
  senderName?: string;
}

export const DnsSetupInstructionsEmail = ({
  recipientName = "IT Team",
  recipientEmail,
  domain = "your-domain.com",
  dnsRecords = [
    { type: "MX", name: "@", value: "10 inbound-smtp.us-east-1.amazonaws.com" },
    { type: "TXT", name: "@", value: "v=spf1 include:amazonses.com ~all" },
    { type: "TXT", name: "_dmarc", value: "v=DMARC1; p=none;" },
  ],
  provider = "your DNS provider",
  senderName = "Team Member",
}: DnsSetupInstructionsEmailProps) => (
  <Html>
    <Head />
    <Preview>DNS setup instructions • {domain}</Preview>
    <Tailwind>
      <Body className="bg-white font-sans text-neutral-800" style={{ margin: "32px" }}>
        <Container style={{ maxWidth: "480px", margin: "0", padding: "0 16px" }}>
          <Text className="text-base leading-7">
            Hi {recipientName},
          </Text>
          <Text className="text-base leading-7">
            {senderName} has requested DNS setup for <strong>{domain}</strong> to enable email services through inbound.
          </Text>
          <Text className="text-base leading-7">
            Please add the following DNS records to {provider}:
          </Text>

          {dnsRecords.length === 0 ? (
            <Text className="text-sm leading-6 text-neutral-600">
              No DNS records were provided. Please check the dashboard for your domain's current records.
            </Text>
          ) : (
            <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "16px", marginBottom: "16px" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left", padding: "8px 16px 8px 0", borderBottom: "1px solid #e5e5e5", fontSize: "12px", color: "#737373" }}>Type</th>
                  <th style={{ textAlign: "left", padding: "8px 16px 8px 0", borderBottom: "1px solid #e5e5e5", fontSize: "12px", color: "#737373" }}>Name</th>
                  <th style={{ textAlign: "left", padding: "8px 0", borderBottom: "1px solid #e5e5e5", fontSize: "12px", color: "#737373" }}>Value</th>
                </tr>
              </thead>
              <tbody>
                {dnsRecords.map((record, index) => (
                  <tr key={index}>
                    <td style={{ padding: "8px 16px 8px 0", borderBottom: "1px solid #e5e5e5", fontSize: "14px", fontFamily: "monospace" }}>{record.type}</td>
                    <td style={{ padding: "8px 16px 8px 0", borderBottom: "1px solid #e5e5e5", fontSize: "14px", fontFamily: "monospace" }}>{record.name}</td>
                    <td style={{ padding: "8px 0", borderBottom: "1px solid #e5e5e5", fontSize: "14px", fontFamily: "monospace", wordBreak: "break-all" }}>{record.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <Text className="mt-6 text-sm font-semibold leading-6">Important notes:</Text>
          <Text className="m-0 text-sm leading-6">- DNS changes can take up to 48 hours to propagate</Text>
          <Text className="m-0 text-sm leading-6">- Some providers may require the full domain (e.g., <CodeInline className="text-xs font-mono bg-[#f0f0f0] px-1 py-0.5 rounded" >_amazonses.{domain}</CodeInline>)</Text>
          <Text className="m-0 text-sm leading-6">- MX records should include a priority value (usually 10)</Text>
          <Text className="m-0 text-sm leading-6">- TXT records may require quotes, depending on your provider</Text>

          <Text className="my-6">
            <Link
              href="https://inbound.new/emails"
              className="text-violet-600 underline"
            >
              View Setup Progress →
            </Link>
          </Text>

          <Text className="text-base leading-7">
            Once you've added these records, verification will happen automatically. Need help with {provider}? See our{" "}
            <Link href="https://inbound.new/docs" className="text-violet-600 underline">
              DNS setup guides
            </Link>{" "}
            or reply to this email.
          </Text>

          <Text className="mt-8 text-sm text-neutral-500">
            — inbound
          </Text>
        </Container>
      </Body>
    </Tailwind>
  </Html>
);

export default DnsSetupInstructionsEmail;

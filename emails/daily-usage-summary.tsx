import {
  Body,
  Container,
  Head,
  Html,
  Link,
  Preview,
  Tailwind,
  Text,
} from "@react-email/components";

interface TopUserRow {
  userEmail: string;
  userName: string | null;
  sent: number;
  received: number;
  total: number;
}

export interface DailyUsageEmailProps {
  dateLabel: string;
  totals: {
    sent: number;
    received: number;
    uniqueSenders: number;
    uniqueRecipients: number;
  };
  topUsers: TopUserRow[];
}

export const DailyUsageSummaryEmail = ({
  dateLabel = "2025-01-01",
  totals = { sent: 0, received: 0, uniqueSenders: 0, uniqueRecipients: 0 },
  topUsers = [ { userEmail: "test@example.com", userName: "Test User", sent: 100, received: 200, total: 300 } ],
}: DailyUsageEmailProps) => (
  <Html>
    <Head />
    <Preview>Daily usage summary • {dateLabel}</Preview>
    <Tailwind>
      <Body className="bg-white font-sans text-neutral-800" style={{ margin: "32px" }}>
        <Container style={{ maxWidth: "480px", margin: "0", padding: "0 16px" }}>
          <Text className="text-base font-semibold leading-7">
            Daily Usage Summary
          </Text>
          <Text className="text-sm text-neutral-600">
            Report date: {dateLabel}
          </Text>

          <Text className="m-0 mt-6 text-sm leading-6">Sent: {(totals?.sent || 0).toLocaleString()}</Text>
          <Text className="m-0 text-sm leading-6">Received: {(totals?.received || 0).toLocaleString()}</Text>
          <Text className="m-0 text-sm leading-6">Unique senders: {(totals?.uniqueSenders || 0).toLocaleString()}</Text>
          <Text className="m-0 text-sm leading-6">Unique recipients: {(totals?.uniqueRecipients || 0).toLocaleString()}</Text>

          <Text className="mt-6 text-sm font-semibold leading-6">Top Users</Text>
          {topUsers.length === 0 ? (
            <Text className="text-sm leading-6 text-neutral-600">
              No user activity recorded for this period.
            </Text>
          ) : (
            topUsers.map((u, i) => (
              <Text key={`${u.userEmail}-${i}`} className="m-0 text-sm leading-6">
                {u.userName || u.userEmail}: {u.sent} sent, {u.received} received ({u.total} total)
              </Text>
            ))
          )}

          <Text className="my-6">
            <Link
              href="https://inbound.new/admin/user-information"
              className="text-violet-600 underline"
            >
              Open Dashboard →
            </Link>
          </Text>

          <Text className="mt-8 text-sm text-neutral-500">
            — inbound
          </Text>
        </Container>
      </Body>
    </Tailwind>
  </Html>
);

export default DailyUsageSummaryEmail;

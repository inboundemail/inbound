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

export default function TeamMemberInvitation({
  inviteeName = "alex@newcompany.com",
  inviterName = "Sarah Johnson",
  inviterEmail = "sarah@acme.com",
  workspaceName = "Acme Corp",
  role = "Editor",
  inviteUrl = "https://app.example.com/invite/abc123def456",
  appName = "ProjectHub",
  logoUrl = "https://placehold.co/120x36?text=ProjectHub",
  expirationDays = 7,
  workspaceDescription = "Our main project workspace for client deliverables",
}: {
  inviteeName: string;
  inviterName: string;
  inviterEmail: string;
  workspaceName: string;
  role: string;
  inviteUrl: string;
  appName: string;
  logoUrl: string;
  expirationDays?: number;
  workspaceDescription?: string;
}) {
  const rolePermissions = {
    "Owner": "Full access to all workspace features and settings",
    "Admin": "Can manage team members, projects, and most settings",
    "Editor": "Can create and edit projects, but limited admin access", 
    "Viewer": "Can view projects and comment, but cannot edit",
    "Guest": "Limited access to specific projects only"
  };

  return (
    <Html>
      <Head />
      <Preview>{inviterName} invited you to join {workspaceName} on {appName}</Preview>
      <Tailwind>
        <Body className="mx-auto my-auto bg-white font-sans">
          <Container className="mx-auto my-10 max-w-[600px] rounded border border-solid border-neutral-200 px-10 py-5">
            <Section className="mt-8">
              <Img src={logoUrl} height="36" alt={appName} className="mx-auto" />
            </Section>
            
            <Heading className="mx-0 my-7 p-0 text-xl font-semibold text-black">
              You're invited to collaborate!
            </Heading>
            
            <Text className="mb-6 text-sm leading-6 text-gray-600">
              Hi there,
            </Text>
            
            <Text className="mb-6 text-sm leading-6 text-gray-600">
              <strong className="font-semibold text-black">{inviterName}</strong> ({inviterEmail}) has invited you to join the <strong className="font-semibold text-black">"{workspaceName}"</strong> workspace on {appName}.
            </Text>

            {workspaceDescription && (
              <Text className="mb-6 text-sm leading-6 text-gray-600">
                <em>"{workspaceDescription}"</em>
              </Text>
            )}

            {/* Invitation Details */}
            <Section className="mb-6 rounded-lg border border-gray-200 p-4">
              <Text className="mb-3 text-base font-semibold text-black">
                Invitation Details
              </Text>
              
              <div className="mb-2 flex justify-between text-sm">
                <Text className="text-gray-600">Workspace:</Text>
                <Text className="font-medium text-black">{workspaceName}</Text>
              </div>
              
              <div className="mb-2 flex justify-between text-sm">
                <Text className="text-gray-600">Your Role:</Text>
                <Text className="font-medium text-black">{role}</Text>
              </div>
              
              <div className="mb-2 flex justify-between text-sm">
                <Text className="text-gray-600">Invited by:</Text>
                <Text className="font-medium text-black">{inviterName}</Text>
              </div>
              
              <div className="mb-2 flex justify-between text-sm">
                <Text className="text-gray-600">Expires:</Text>
                <Text className="font-medium text-black">In {expirationDays} days</Text>
              </div>
            </Section>

            {/* Role Permissions */}
            <Section className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
              <Text className="mb-2 text-sm font-semibold text-blue-800">
                🔑 As a {role}, you'll be able to:
              </Text>
              <Text className="text-sm leading-5 text-blue-700">
                {rolePermissions[role as keyof typeof rolePermissions] || "Collaborate on projects with your team"}
              </Text>
            </Section>

            <Section className="mb-8 text-center">
              <Link
                className="inline-block rounded-lg bg-green-600 px-6 py-3 text-center text-sm font-semibold text-white no-underline"
                href={inviteUrl}
              >
                Accept Invitation
              </Link>
            </Section>

            <Text className="mb-4 text-sm leading-6 text-gray-600">
              If the button doesn't work, copy and paste this link into your browser:
            </Text>
            
            <Text className="mb-6 break-all rounded bg-gray-100 p-3 text-xs text-gray-800">
              {inviteUrl}
            </Text>

            <Hr className="mx-0 my-6 w-full border-t border-solid border-neutral-200" />

            {/* What happens next */}
            <Section className="mb-6">
              <Text className="mb-3 text-base font-semibold text-black">
                What happens next?
              </Text>
              
              <Text className="mb-3 text-sm leading-6 text-gray-600">
                <strong className="font-medium text-black">1. Create your account</strong>
                <br />
                If you don't have a {appName} account yet, you'll create one during the invitation process.
              </Text>
              
              <Text className="mb-3 text-sm leading-6 text-gray-600">
                <strong className="font-medium text-black">2. Join the workspace</strong>
                <br />
                You'll automatically be added to {workspaceName} with {role} permissions.
              </Text>
              
              <Text className="mb-3 text-sm leading-6 text-gray-600">
                <strong className="font-medium text-black">3. Start collaborating</strong>
                <br />
                Access shared projects and start working with your team immediately.
              </Text>
            </Section>

            <Section className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <Text className="mb-2 text-sm font-semibold text-amber-800">
                ⚠️ This invitation expires in {expirationDays} days
              </Text>
              <Text className="text-sm leading-5 text-amber-700">
                Accept your invitation soon! Expired invitations cannot be used and {inviterName} will need to send a new one.
              </Text>
            </Section>

            <Text className="mb-4 text-sm leading-6 text-gray-600">
              Don't recognize {inviterName} or {workspaceName}? You can safely ignore this email.
            </Text>

            <Text className="mb-4 text-xs leading-5 text-gray-500">
              This invitation was sent to {inviteeName} by {inviterName} ({inviterEmail}).
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

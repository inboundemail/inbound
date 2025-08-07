import { DomainVerifiedEmail } from './domain-verified';

export default function DomainVerifiedPreview() {
  return (
    <DomainVerifiedEmail
      userFirstname="Ryan"
      domain="xdemo.inbound.run"
      verifiedAt="December 28, 2024 at 5:48 PM EST"
    />
  );
}
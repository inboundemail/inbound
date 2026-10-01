import { Elysia, t } from "elysia";
import { validateAndRateLimit } from "../lib/auth";
import { db } from "@/lib/db";
import {
  emailDomains,
  emailAddresses,
  endpoints,
  domainDnsRecords,
} from "@/lib/db/schema";
import { eq, and, count } from "drizzle-orm";
import { verifyDnsRecords, reevaluateCanReceiveEmails } from "@/lib/domains-and-dns/dns";
import {
  SESClient,
  GetIdentityVerificationAttributesCommand,
  GetIdentityDkimAttributesCommand,
  GetIdentityMailFromDomainAttributesCommand,
  SetIdentityMailFromDomainCommand,
  VerifyDomainIdentityCommand,
} from "@aws-sdk/client-ses";
import { isSubdomain, getRootDomain } from "@/lib/domains-and-dns/domain-utils";

// AWS SES Client setup
const awsRegion = process.env.AWS_REGION || "us-east-2";
const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

let sesClient: SESClient | null = null;

if (awsAccessKeyId && awsSecretAccessKey) {
  sesClient = new SESClient({
    region: awsRegion,
    credentials: {
      accessKeyId: awsAccessKeyId,
      secretAccessKey: awsSecretAccessKey,
    },
  });
}

// Request/Response Types (OpenAPI-compatible)
const GetDomainQuery = t.Object({
  check: t.Optional(t.String({ enum: ["true"] })),
});

const DomainStatsSchema = t.Object({
  totalEmailAddresses: t.Number(),
  activeEmailAddresses: t.Number(),
  emailsLast24h: t.Number(),
  emailsLast7d: t.Number(),
  emailsLast30d: t.Number(),
});

const CatchAllEndpointSchema = t.Optional(
  t.Nullable(
    t.Object({
      id: t.String(),
      name: t.String(),
      type: t.String(),
      isActive: t.Boolean(),
    })
  )
);

const DnsRecordSchema = t.Object({
  id: t.String(),
  domainId: t.String(),
  recordType: t.String(),
  name: t.String(),
  value: t.String(),
  isRequired: t.Boolean(),
  isVerified: t.Boolean(),
  lastChecked: t.Nullable(t.String({ format: "date-time" })),
  createdAt: t.String({ format: "date-time" }),
});

const VerificationDnsRecordSchema = t.Object({
  type: t.String(),
  name: t.String(),
  value: t.String(),
  isVerified: t.Boolean(),
  error: t.Optional(t.String()),
});

const VerificationCheckSchema = t.Optional(
  t.Object({
    dnsRecords: t.Array(VerificationDnsRecordSchema),
    sesStatus: t.String(),
    dkimStatus: t.Optional(t.String()),
    dkimVerified: t.Optional(t.Boolean()),
    dkimTokens: t.Optional(t.Array(t.String())),
    mailFromDomain: t.Optional(t.String()),
    mailFromStatus: t.Optional(t.String()),
    mailFromVerified: t.Optional(t.Boolean()),
    isFullyVerified: t.Boolean(),
    lastChecked: t.String({ format: "date-time" }),
  })
);

const AuthRecommendationSchema = t.Object({
  name: t.String(),
  value: t.String(),
  description: t.String(),
});

const AuthRecommendationsSchema = t.Optional(
  t.Object({
    spf: t.Optional(AuthRecommendationSchema),
    dmarc: t.Optional(AuthRecommendationSchema),
  })
);

// Error response schema
const GetDomainErrorResponse = t.Object({
  error: t.String(),
});

const GetDomainResponse = t.Object({
  id: t.String(),
  domain: t.String(),
  status: t.String(),
  canReceiveEmails: t.Boolean(),
  hasMxRecords: t.Boolean(),
  domainProvider: t.Nullable(t.String()),
  providerConfidence: t.Nullable(t.String()),
  lastDnsCheck: t.Nullable(t.String({ format: "date-time" })),
  lastSesCheck: t.Nullable(t.String({ format: "date-time" })),
  isCatchAllEnabled: t.Boolean(),
  catchAllEndpointId: t.Nullable(t.String()),
  mailFromDomain: t.Nullable(t.String()),
  mailFromDomainStatus: t.Nullable(t.String()),
  mailFromDomainVerifiedAt: t.Nullable(t.String({ format: "date-time" })),
  receiveDmarcEmails: t.Boolean(),
  createdAt: t.String({ format: "date-time" }),
  updatedAt: t.String({ format: "date-time" }),
  userId: t.String(),
  stats: DomainStatsSchema,
  catchAllEndpoint: CatchAllEndpointSchema,
  dnsRecords: t.Array(DnsRecordSchema),
  verificationCheck: VerificationCheckSchema,
  authRecommendations: AuthRecommendationsSchema,
  // Subdomain inheritance info
  inheritsFromParent: t.Optional(t.Boolean()),
  parentDomain: t.Optional(t.Nullable(t.String())),
  // 'managed' = instant <slug>.inbnd.dev domain provisioned by inbound (no DNS to check)
  kind: t.Optional(t.String()),
});

export const getDomain = new Elysia().get(
  "/domains/:id",
  async ({ request, params, query, set }) => {
    console.log(
      "🌐 GET /api/e2/domains/:id - Starting request for domain:",
      params.id
    );

    // Auth & rate limit validation - throws on error
    const userId = await validateAndRateLimit(request, set);
    console.log("✅ Authentication successful for userId:", userId);

    const check = query.check === "true";
    if (check) {
      console.log(
        "🔍 Check parameter detected - will perform verification check"
      );
    }

    // Get domain with user verification
    console.log("🔍 Querying domain from database");
    const domainResult = await db
      .select()
      .from(emailDomains)
      .where(
        and(eq(emailDomains.id, params.id), eq(emailDomains.userId, userId))
      )
      .limit(1);

    if (!domainResult[0]) {
      console.log(
        "❌ Domain not found for user:",
        userId,
        "domain:",
        params.id
      );
      set.status = 404;
      return { error: "Domain not found" };
    }

    const domain = domainResult[0];
    console.log("✅ Found domain:", domain.domain, "status:", domain.status);

    // Check if this is a subdomain that inherits verification from a parent
    let inheritsFromParent = false;
    let parentDomainName: string | null = null;
    const isManaged = domain.kind === "managed";

    if (isManaged) {
      // Managed <slug>.inbnd.dev domains send and receive through inbound's own
      // inbnd.dev setup, so there is nothing for the user to verify.
      inheritsFromParent = true;
      parentDomainName = "inbnd.dev";
    } else if (isSubdomain(domain.domain)) {
      const rootDomain = getRootDomain(domain.domain);
      if (rootDomain) {
        // Check if user has the parent domain verified
        const parentDomainResult = await db
          .select()
          .from(emailDomains)
          .where(
            and(
              eq(emailDomains.domain, rootDomain),
              eq(emailDomains.userId, userId),
              eq(emailDomains.status, "verified")
            )
          )
          .limit(1);

        if (parentDomainResult[0]) {
          inheritsFromParent = true;
          parentDomainName = rootDomain;
          console.log(
            `📋 Subdomain ${domain.domain} inherits from verified parent: ${rootDomain}`
          );
        }
      }
    }

    // Get domain statistics
    console.log("📊 Calculating domain statistics");
    const emailCountResult = await db
      .select({ count: count() })
      .from(emailAddresses)
      .where(eq(emailAddresses.domainId, params.id));

    const emailCount = emailCountResult[0]?.count || 0;

    const activeEmailCountResult = await db
      .select({ count: count() })
      .from(emailAddresses)
      .where(
        and(
          eq(emailAddresses.domainId, params.id),
          eq(emailAddresses.isActive, true)
        )
      );

    const activeEmailCount = activeEmailCountResult[0]?.count || 0;

    // Get catch-all endpoint information
    let catchAllEndpoint: {
      id: string;
      name: string;
      type: string;
      isActive: boolean;
    } | null = null;
    if (domain.catchAllEndpointId) {
      console.log("🔍 Getting catch-all endpoint information");
      const endpointResult = await db
        .select({
          id: endpoints.id,
          name: endpoints.name,
          type: endpoints.type,
          isActive: endpoints.isActive,
        })
        .from(endpoints)
        .where(eq(endpoints.id, domain.catchAllEndpointId))
        .limit(1);

      if (endpointResult[0]) {
        catchAllEndpoint = {
          id: endpointResult[0].id,
          name: endpointResult[0].name,
          type: endpointResult[0].type,
          isActive: endpointResult[0].isActive || false,
        };
      }
    }

    // Get DNS records (always include)
    console.log("🔍 Fetching DNS records");
    const dnsRecordsResult = await db
      .select()
      .from(domainDnsRecords)
      .where(eq(domainDnsRecords.domainId, params.id));

    const dnsRecords = dnsRecordsResult.map((record) => ({
      id: record.id,
      domainId: record.domainId,
      recordType: record.recordType,
      name: record.name,
      value: record.value,
      isRequired: record.isRequired || false,
      isVerified: record.isVerified || false,
      lastChecked: record.lastChecked?.toISOString() || null,
      createdAt: (record.createdAt || new Date()).toISOString(),
    }));

    // Calculate time-based email statistics
    const stats = {
      totalEmailAddresses: emailCount,
      activeEmailAddresses: activeEmailCount,
      emailsLast24h: 0, // TODO: Implement actual email counting
      emailsLast7d: 0,
      emailsLast30d: 0,
    };

    // Prepare base response
    let response: any = {
      id: domain.id,
      domain: domain.domain,
      status: domain.status,
      canReceiveEmails: domain.canReceiveEmails || false,
      hasMxRecords: domain.hasMxRecords || false,
      domainProvider: domain.domainProvider,
      providerConfidence: domain.providerConfidence,
      lastDnsCheck: domain.lastDnsCheck?.toISOString() || null,
      lastSesCheck: domain.lastSesCheck?.toISOString() || null,
      isCatchAllEnabled: domain.isCatchAllEnabled || false,
      catchAllEndpointId: domain.catchAllEndpointId,
      mailFromDomain: domain.mailFromDomain,
      mailFromDomainStatus: domain.mailFromDomainStatus,
      mailFromDomainVerifiedAt:
        domain.mailFromDomainVerifiedAt?.toISOString() || null,
      receiveDmarcEmails: domain.receiveDmarcEmails || false,
      createdAt: (domain.createdAt || new Date()).toISOString(),
      updatedAt: (domain.updatedAt || new Date()).toISOString(),
      userId: domain.userId,
      stats,
      catchAllEndpoint,
      dnsRecords,
      // Subdomain inheritance info
      inheritsFromParent,
      parentDomain: parentDomainName,
      kind: domain.kind,
    };

    // If check=true, perform DNS and SES verification checks
    if (check && !isManaged) {
      console.log(
        `🔍 Performing verification check for domain: ${domain.domain}`
      );

      try {
        let verificationResults: Array<{
          type: string;
          name: string;
          value: string;
          isVerified: boolean;
          error?: string;
        }> = [];

        // Build list of records to verify
        const recordsToVerify: Array<{
          type: string;
          name: string;
          value: string;
          dbId: string | null;
        }> = dnsRecordsResult.map((record) => ({
          type: record.recordType,
          name: record.name,
          value: record.value,
          dbId: record.id,
        }));

        // Skip SPF/DMARC checks for subdomains that inherit from a verified parent
        // These records should be configured on the parent domain, not the subdomain
        if (!inheritsFromParent) {
          // Check for SPF and DMARC for root domains or domains without verified parent
          const spfRecord = dnsRecordsResult.find(
            (r) =>
              r.recordType === "TXT" &&
              r.name === domain.domain &&
              (r.value || "").toLowerCase().includes("v=spf1")
          );
          if (!spfRecord) {
            recordsToVerify.push({
              type: "TXT",
              name: domain.domain,
              value: "v=spf1 include:amazonses.com ~all",
              dbId: null,
            });
          }

          const dmarcRecord = dnsRecordsResult.find(
            (r) =>
              r.recordType === "TXT" && r.name === `_dmarc.${domain.domain}`
          );
          if (!dmarcRecord) {
            recordsToVerify.push({
              type: "TXT",
              name: `_dmarc.${domain.domain}`,
              value: `v=DMARC1; p=none; rua=mailto:dmarc@${domain.domain}; ruf=mailto:dmarc@${domain.domain}; fo=1; aspf=r; adkim=r`,
              dbId: null,
            });
          }
        } else {
          console.log(
            `⏭️ Skipping SPF/DMARC checks for subdomain ${domain.domain} (inherits from parent)`
          );
        }

        if (recordsToVerify.length > 0) {
          console.log(
            `🔍 Verifying ${recordsToVerify.length} DNS records (including SPF/DMARC checks)`
          );
          const results = await verifyDnsRecords(
            recordsToVerify.map((record) => ({
              type: record.type,
              name: record.name,
              value: record.value,
            }))
          );

          verificationResults = results.map((result) => ({
            type: result.type,
            name: result.name,
            value: result.expectedValue,
            isVerified: result.isVerified,
            error: result.error,
          }));

          // Update DNS record verification status in database (only for records that exist in DB)
          await Promise.all(
            recordsToVerify.map(async (record, index) => {
              if (record.dbId) {
                const verificationResult = results[index];
                await db
                  .update(domainDnsRecords)
                  .set({
                    isVerified: verificationResult.isVerified,
                    lastChecked: new Date(),
                  })
                  .where(eq(domainDnsRecords.id, record.dbId));
              }
            })
          );
        }

        // Check SES verification status
        let sesStatus = "Unknown";
        let dkimStatus: string | undefined;
        let dkimVerified = false;
        let dkimTokens: string[] | undefined;
        let mailFromDomain: string | undefined;
        let mailFromStatus: string | undefined;
        let mailFromVerified = false;

        // For subdomains that inherit from parent, skip SES check (they don't have their own SES identity)
        if (inheritsFromParent) {
          console.log(
            `⏭️ Skipping SES verification for subdomain ${domain.domain} (inherits from parent)`
          );
          // Set status to reflect inheritance
          sesStatus = "InheritedFromParent";
          dkimStatus = "InheritedFromParent";
          dkimVerified = true; // Parent has DKIM verified
          mailFromStatus = "InheritedFromParent";
          mailFromVerified = true; // Parent handles mail from
        } else if (sesClient) {
          try {
            console.log(`🔍 Checking SES verification status`);
            const getAttributesCommand =
              new GetIdentityVerificationAttributesCommand({
                Identities: [domain.domain],
              });
            const attributesResponse =
              await sesClient.send(getAttributesCommand);
            const attributes =
              attributesResponse.VerificationAttributes?.[domain.domain];
            sesStatus = attributes?.VerificationStatus || "NotFound";

            // DKIM status
            const dkimCmd = new GetIdentityDkimAttributesCommand({
              Identities: [domain.domain],
            });
            const dkimResp = await sesClient.send(dkimCmd);
            const dkimAttrs = dkimResp.DkimAttributes?.[domain.domain];
            dkimStatus = dkimAttrs?.DkimVerificationStatus || "Pending";
            dkimVerified = dkimStatus === "Success";
            dkimTokens = dkimAttrs?.DkimTokens || [];

            // MAIL FROM status
            const mailFromCmd = new GetIdentityMailFromDomainAttributesCommand({
              Identities: [domain.domain],
            });
            const mailFromResp = await sesClient.send(mailFromCmd);
            const mailFromAttrs =
              mailFromResp.MailFromDomainAttributes?.[domain.domain];
            mailFromDomain = mailFromAttrs?.MailFromDomain;
            mailFromStatus = mailFromAttrs?.MailFromDomainStatus || "NotSet";
            mailFromVerified = mailFromStatus === "Success";

            // Retry MAIL FROM setup if still pending, failed, or not set
            if (
              sesStatus === "Success" &&
              (mailFromStatus === "Pending" ||
                mailFromStatus === "Failed" ||
                mailFromStatus === "NotSet")
            ) {
              try {
                const expectedMailFromDomain = `mail.${domain.domain}`;
                console.log(
                  `🔄 Retrying MAIL FROM domain setup: ${expectedMailFromDomain} (current status: ${mailFromStatus})`
                );

                const retryMailFromCommand =
                  new SetIdentityMailFromDomainCommand({
                    Identity: domain.domain,
                    MailFromDomain: expectedMailFromDomain,
                    BehaviorOnMXFailure: "UseDefaultValue",
                  });
                await sesClient.send(retryMailFromCommand);

                // Wait a moment for AWS to process
                await new Promise((resolve) => setTimeout(resolve, 1000));

                // Check status again after retry
                const recheckMailFromCmd =
                  new GetIdentityMailFromDomainAttributesCommand({
                    Identities: [domain.domain],
                  });
                const recheckMailFromResp =
                  await sesClient.send(recheckMailFromCmd);
                const recheckMailFromAttrs =
                  recheckMailFromResp.MailFromDomainAttributes?.[domain.domain];

                if (recheckMailFromAttrs) {
                  mailFromDomain = recheckMailFromAttrs.MailFromDomain;
                  mailFromStatus =
                    recheckMailFromAttrs.MailFromDomainStatus || "Pending";
                  mailFromVerified = mailFromStatus === "Success";
                  console.log(
                    `✅ MAIL FROM retry completed: ${mailFromDomain} (new status: ${mailFromStatus})`
                  );
                }
              } catch (retryError) {
                console.warn(
                  `⚠️ MAIL FROM retry failed for ${domain.domain}:`,
                  retryError
                );
              }
            }

            // Update domain status based on SES verification
            // Create timestamps once to ensure consistency between DB and response
            const now = new Date();
            const updateData: any = {
              lastSesCheck: now,
              updatedAt: now,
            };

            if (mailFromDomain && mailFromStatus) {
              updateData.mailFromDomain = mailFromDomain;
              updateData.mailFromDomainStatus = mailFromStatus;
              if (mailFromStatus === "Success") {
                updateData.mailFromDomainVerifiedAt = now;
              }
              response.mailFromDomain = mailFromDomain;
              response.mailFromDomainStatus = mailFromStatus;
              response.mailFromDomainVerifiedAt =
                mailFromStatus === "Success"
                  ? now.toISOString()
                  : response.mailFromDomainVerifiedAt;
            }

            if (sesStatus === "Success" && domain.status !== "verified") {
              updateData.status = "verified";
              await db
                .update(emailDomains)
                .set(updateData)
                .where(eq(emailDomains.id, domain.id));
              response.status = "verified";
              response.updatedAt = updateData.updatedAt.toISOString();
            } else if (sesStatus === "Failed") {
              // Check if DNS records are all verified - if so, attempt re-verification
              const dnsAllVerified =
                verificationResults.length > 0 &&
                verificationResults.every((r) => r.isVerified);

              if (dnsAllVerified) {
                // DNS is verified but email service failed - attempt re-verification
                console.log(
                  `🔄 DNS verified but email service failed for ${domain.domain} - attempting re-verification`
                );
                try {
                  const verifyCommand = new VerifyDomainIdentityCommand({
                    Domain: domain.domain,
                  });
                  await sesClient.send(verifyCommand);
                  
                  // Set status to pending to allow re-verification to complete
                  updateData.status = "pending";
                  await db
                    .update(emailDomains)
                    .set(updateData)
                    .where(eq(emailDomains.id, domain.id));
                  response.status = "pending";
                  response.updatedAt = updateData.updatedAt.toISOString();
                  sesStatus = "Pending"; // Update for response
                  console.log(
                    `✅ Re-verification initiated for ${domain.domain} - status set to pending`
                  );
                } catch (reVerifyError) {
                  console.error(
                    `❌ Failed to re-initiate verification for ${domain.domain}:`,
                    reVerifyError
                  );
                  // Keep as failed if re-verification fails
                  if (domain.status !== "failed") {
                    updateData.status = "failed";
                    await db
                      .update(emailDomains)
                      .set(updateData)
                      .where(eq(emailDomains.id, domain.id));
                    response.status = "failed";
                    response.updatedAt = updateData.updatedAt.toISOString();
                  }
                }
              } else if (domain.status !== "failed") {
                // DNS not verified and SES failed - mark as failed
                updateData.status = "failed";
                await db
                  .update(emailDomains)
                  .set(updateData)
                  .where(eq(emailDomains.id, domain.id));
                response.status = "failed";
                response.updatedAt = updateData.updatedAt.toISOString();
              }
            } else {
              await db
                .update(emailDomains)
                .set(updateData)
                .where(eq(emailDomains.id, domain.id));
              response.updatedAt = updateData.updatedAt.toISOString();
            }
          } catch (sesError) {
            console.error(`❌ Email service verification check failed:`, sesError);
            sesStatus = "Error";
          }
        }

        const allDnsVerified =
          verificationResults.length > 0 &&
          verificationResults.every((r) => r.isVerified);

        // For subdomains that inherit from parent, they're fully verified when DNS (MX) is verified
        // They inherit SES/DKIM/MAIL FROM from the parent domain
        const sesVerifiedOrInherited =
          sesStatus === "Success" || sesStatus === "InheritedFromParent";
        const isFullyVerified = allDnsVerified && sesVerifiedOrInherited;

        // Update domain status for subdomains that inherit from verified parent
        if (
          inheritsFromParent &&
          allDnsVerified &&
          domain.status !== "verified"
        ) {
          console.log(
            `✅ Marking subdomain ${domain.domain} as verified (inherits from parent, DNS verified)`
          );
          // Create timestamp once to ensure consistency between DB and response
          const subdomainUpdateTime = new Date();
          await db
            .update(emailDomains)
            .set({
              status: "verified",
              canReceiveEmails: true,
              hasMxRecords: true,
              updatedAt: subdomainUpdateTime,
            })
            .where(eq(emailDomains.id, domain.id));
          response.status = "verified";
          response.canReceiveEmails = true;
          response.hasMxRecords = true;
          response.updatedAt = subdomainUpdateTime.toISOString();
        }

        // Re-evaluate canReceiveEmails for non-subdomain domains that are fully verified
        if (isFullyVerified && !domain.canReceiveEmails && !inheritsFromParent) {
          const canReceive = await reevaluateCanReceiveEmails(domain.domain);
          if (canReceive) {
            console.log(`📝 Updating canReceiveEmails to true for ${domain.domain}`);
            const reevalUpdateTime = new Date();
            await db
              .update(emailDomains)
              .set({
                canReceiveEmails: true,
                lastDnsCheck: reevalUpdateTime,
                updatedAt: reevalUpdateTime,
              })
              .where(eq(emailDomains.id, domain.id));
            response.canReceiveEmails = true;
            response.updatedAt = reevalUpdateTime.toISOString();
          }
        }

        response.verificationCheck = {
          dnsRecords: verificationResults,
          sesStatus,
          dkimStatus,
          dkimVerified,
          dkimTokens,
          mailFromDomain,
          mailFromStatus,
          mailFromVerified,
          isFullyVerified,
          lastChecked: new Date().toISOString(),
        };

        console.log(`✅ Verification check complete for ${domain.domain}:`, {
          dnsVerified: allDnsVerified,
          sesStatus,
          dkimStatus,
          mailFromStatus,
          isFullyVerified,
        });
      } catch (checkError) {
        console.error(
          `❌ Verification check failed for ${domain.domain}:`,
          checkError
        );
        response.verificationCheck = {
          dnsRecords: [],
          sesStatus: "Error",
          dkimStatus: "Unknown",
          dkimVerified: false,
          dkimTokens: [],
          mailFromStatus: "Unknown",
          mailFromVerified: false,
          isFullyVerified: false,
          lastChecked: new Date().toISOString(),
        };
      }

      // Build recommendations if SPF/DMARC missing or not verified
      // Skip for subdomains that inherit from a verified parent (SPF/DMARC should be on parent)
      if (!inheritsFromParent) {
        try {
          const verificationCheckResults =
            response.verificationCheck?.dnsRecords || [];
          const spfVerified = verificationCheckResults.some(
            (r: any) =>
              r.type === "TXT" && r.name === domain.domain && r.isVerified
          );
          const dmarcVerified = verificationCheckResults.some(
            (r: any) =>
              r.type === "TXT" &&
              r.name === `_dmarc.${domain.domain}` &&
              r.isVerified
          );

          const recommendations: any = {};

          if (!spfVerified) {
            recommendations.spf = {
              name: domain.domain,
              value: "v=spf1 include:amazonses.com ~all",
              description: "SPF record for root domain (recommended)",
            };
          }

          if (!dmarcVerified) {
            recommendations.dmarc = {
              name: `_dmarc.${domain.domain}`,
              value: `v=DMARC1; p=none; rua=mailto:dmarc@${domain.domain}; ruf=mailto:dmarc@${domain.domain}; fo=1; aspf=r; adkim=r`,
              description:
                "DMARC policy record (starts with p=none for monitoring)",
            };
          }

          if (recommendations.spf || recommendations.dmarc) {
            response.authRecommendations = recommendations;
          }
        } catch (recError) {
          console.warn("⚠️ Failed to build auth recommendations:", recError);
        }
      } else {
        console.log(
          `⏭️ Skipping auth recommendations for subdomain ${domain.domain} (inherits from parent)`
        );
      }
    }

    console.log("✅ Successfully retrieved domain details");
    return response;
  },
  {
    params: t.Object({
      id: t.String(),
    }),
    query: GetDomainQuery,
    response: {
      200: GetDomainResponse,
      401: GetDomainErrorResponse,
      404: GetDomainErrorResponse,
      500: GetDomainErrorResponse,
    },
    detail: {
      tags: ["Domains"],
      summary: "Get domain by ID",
      description:
        "Get detailed information about a specific domain including DNS records. Use `?check=true` for a live verification check.",
    },
  }
);

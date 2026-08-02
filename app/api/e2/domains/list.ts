import { Elysia, t } from "elysia";
import { validateAndRateLimit } from "../lib/auth";
import { db } from "@/lib/db";
import {
  emailDomains,
  emailAddresses,
  endpoints,
  domainDnsRecords,
} from "@/lib/db/schema";
import { eq, and, desc, count } from "drizzle-orm";
import { verifyDnsRecords } from "@/lib/domains-and-dns/dns";
import {
  SESClient,
  GetIdentityVerificationAttributesCommand,
} from "@aws-sdk/client-ses";

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
const ListDomainsQuery = t.Object({
  limit: t.Optional(t.Integer({ minimum: 1, maximum: 100, default: 50 })),
  offset: t.Optional(t.Integer({ minimum: 0, default: 0 })),
  status: t.Optional(t.String({ enum: ["pending", "verified", "failed"] })),
  canReceive: t.Optional(t.String({ enum: ["true", "false"] })),
  check: t.Optional(t.String({ enum: ["true"] })),
});

const DomainStatsSchema = t.Object({
  totalEmailAddresses: t.Number(),
  activeEmailAddresses: t.Number(),
  hasCatchAll: t.Boolean(),
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
    isFullyVerified: t.Boolean(),
    lastChecked: t.String({ format: "date-time" }),
  })
);

const DomainSchema = t.Object({
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
  verificationCheck: VerificationCheckSchema,
});

const PaginationSchema = t.Object({
  limit: t.Number(),
  offset: t.Number(),
  total: t.Number(),
  hasMore: t.Boolean(),
});

const ListDomainsResponse = t.Object({
  data: t.Array(DomainSchema),
  pagination: PaginationSchema,
});

const ErrorResponse = t.Object({
  error: t.String(),
  message: t.Optional(t.String()),
  statusCode: t.Optional(t.Number()),
});

export const listDomains = new Elysia().get(
  "/domains",
  async ({ request, query, set }) => {
    console.log("🌐 GET /api/e2/domains - Starting request");

    // Auth & rate limit validation - throws on error
    const userId = await validateAndRateLimit(request, set);
    console.log("✅ Authentication successful for userId:", userId);

    // Extract and validate query parameters
    const limit = Math.min(query.limit || 50, 100);
    const offset = query.offset || 0;
    const status = query.status;
    const canReceive = query.canReceive;
    const check = query.check === "true";

    console.log("📊 Query parameters:", {
      limit,
      offset,
      status,
      canReceive,
      check,
    });

    // Build where conditions
    const conditions = [eq(emailDomains.userId, userId)];

    if (status && ["pending", "verified", "failed"].includes(status)) {
      conditions.push(eq(emailDomains.status, status));
      console.log("🔍 Filtering by status:", status);
    }

    if (canReceive !== undefined) {
      const canReceiveEmails = canReceive === "true";
      conditions.push(eq(emailDomains.canReceiveEmails, canReceiveEmails));
      console.log("🔍 Filtering by canReceive:", canReceiveEmails);
    }

    const whereConditions =
      conditions.length > 1 ? and(...conditions) : conditions[0];

    // Get domains
    console.log("🔍 Querying domains from database");
    const domains = await db
      .select({
        id: emailDomains.id,
        domain: emailDomains.domain,
        status: emailDomains.status,
        canReceiveEmails: emailDomains.canReceiveEmails,
        hasMxRecords: emailDomains.hasMxRecords,
        domainProvider: emailDomains.domainProvider,
        providerConfidence: emailDomains.providerConfidence,
        lastDnsCheck: emailDomains.lastDnsCheck,
        lastSesCheck: emailDomains.lastSesCheck,
        isCatchAllEnabled: emailDomains.isCatchAllEnabled,
        catchAllEndpointId: emailDomains.catchAllEndpointId,
        mailFromDomain: emailDomains.mailFromDomain,
        mailFromDomainStatus: emailDomains.mailFromDomainStatus,
        mailFromDomainVerifiedAt: emailDomains.mailFromDomainVerifiedAt,
        receiveDmarcEmails: emailDomains.receiveDmarcEmails,
        createdAt: emailDomains.createdAt,
        updatedAt: emailDomains.updatedAt,
        userId: emailDomains.userId,
      })
      .from(emailDomains)
      .where(whereConditions)
      .orderBy(desc(emailDomains.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count for pagination
    const totalCountResult = await db
      .select({ count: count() })
      .from(emailDomains)
      .where(whereConditions);

    const totalCount = totalCountResult[0]?.count || 0;

    console.log(
      "📊 Found",
      domains.length,
      "domains out of",
      totalCount,
      "total"
    );

    // Enhance domains with stats, catch-all endpoint info, and verification check
    const enhancedDomains = await Promise.all(
      domains.map(async (domain) => {
        // Get email address count
        const emailCountResult = await db
          .select({ count: count() })
          .from(emailAddresses)
          .where(eq(emailAddresses.domainId, domain.id));

        const emailCount = emailCountResult[0]?.count || 0;

        // Get active email address count
        const activeEmailCountResult = await db
          .select({ count: count() })
          .from(emailAddresses)
          .where(
            and(
              eq(emailAddresses.domainId, domain.id),
              eq(emailAddresses.isActive, true)
            )
          );

        const activeEmailCount = activeEmailCountResult[0]?.count || 0;

        // Get catch-all endpoint info if configured
        let catchAllEndpoint: {
          id: string;
          name: string;
          type: string;
          isActive: boolean;
        } | null = null;
        if (domain.catchAllEndpointId) {
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

          catchAllEndpoint = endpointResult[0]
            ? {
                id: endpointResult[0].id,
                name: endpointResult[0].name,
                type: endpointResult[0].type,
                isActive: endpointResult[0].isActive || false,
              }
            : null;
        }

        const enhancedDomain: any = {
          ...domain,
          canReceiveEmails: domain.canReceiveEmails || false,
          hasMxRecords: domain.hasMxRecords || false,
          isCatchAllEnabled: domain.isCatchAllEnabled || false,
          receiveDmarcEmails: domain.receiveDmarcEmails || false,
          lastDnsCheck: domain.lastDnsCheck?.toISOString() || null,
          lastSesCheck: domain.lastSesCheck?.toISOString() || null,
          mailFromDomainVerifiedAt:
            domain.mailFromDomainVerifiedAt?.toISOString() || null,
          createdAt: (domain.createdAt || new Date()).toISOString(),
          updatedAt: (domain.updatedAt || new Date()).toISOString(),
          stats: {
            totalEmailAddresses: emailCount,
            activeEmailAddresses: activeEmailCount,
            hasCatchAll: !!domain.catchAllEndpointId,
          },
          catchAllEndpoint,
        };

        // If check=true, perform DNS and SES verification checks
        if (check) {
          console.log(
            `🔍 Performing verification check for domain: ${domain.domain}`
          );

          try {
            // Get DNS records from database
            const dnsRecords = await db
              .select()
              .from(domainDnsRecords)
              .where(eq(domainDnsRecords.domainId, domain.id));

            let verificationResults: Array<{
              type: string;
              name: string;
              value: string;
              isVerified: boolean;
              error?: string;
            }> = [];

            if (dnsRecords.length > 0) {
              // Verify DNS records
              console.log(`🔍 Verifying ${dnsRecords.length} DNS records`);
              const results = await verifyDnsRecords(
                dnsRecords.map((record) => ({
                  type: record.recordType,
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

              // Update DNS record verification status in database
              await Promise.all(
                dnsRecords.map(async (record, index) => {
                  const verificationResult = results[index];
                  await db
                    .update(domainDnsRecords)
                    .set({
                      isVerified: verificationResult.isVerified,
                      lastChecked: new Date(),
                    })
                    .where(eq(domainDnsRecords.id, record.id));
                })
              );
            }

            // Check SES verification status
            let sesStatus = "Unknown";
            if (sesClient) {
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

                // Update domain status based on SES verification
                if (sesStatus === "Success" && domain.status !== "verified") {
                  await db
                    .update(emailDomains)
                    .set({
                      status: "verified",
                      lastSesCheck: new Date(),
                      updatedAt: new Date(),
                    })
                    .where(eq(emailDomains.id, domain.id));
                  enhancedDomain.status = "verified";
                } else if (
                  sesStatus === "Failed" &&
                  domain.status !== "failed"
                ) {
                  await db
                    .update(emailDomains)
                    .set({
                      status: "failed",
                      lastSesCheck: new Date(),
                      updatedAt: new Date(),
                    })
                    .where(eq(emailDomains.id, domain.id));
                  enhancedDomain.status = "failed";
                } else {
                  await db
                    .update(emailDomains)
                    .set({
                      lastSesCheck: new Date(),
                    })
                    .where(eq(emailDomains.id, domain.id));
                }
              } catch (sesError) {
                console.error(`❌ SES verification check failed:`, sesError);
                sesStatus = "Error";
              }
            }

            const allDnsVerified =
              verificationResults.length > 0 &&
              verificationResults.every((r) => r.isVerified);
            const isFullyVerified = allDnsVerified && sesStatus === "Success";

            enhancedDomain.verificationCheck = {
              dnsRecords: verificationResults,
              sesStatus,
              isFullyVerified,
              lastChecked: new Date().toISOString(),
            };

            console.log(
              `✅ Verification check complete for ${domain.domain}:`,
              {
                dnsVerified: allDnsVerified,
                sesStatus,
                isFullyVerified,
              }
            );
          } catch (checkError) {
            console.error(
              `❌ Verification check failed for ${domain.domain}:`,
              checkError
            );
            enhancedDomain.verificationCheck = {
              dnsRecords: [],
              sesStatus: "Error",
              isFullyVerified: false,
              lastChecked: new Date().toISOString(),
            };
          }
        }

        return enhancedDomain;
      })
    );

    const response = {
      data: enhancedDomains,
      pagination: {
        limit,
        offset,
        total: totalCount,
        hasMore: offset + domains.length < totalCount,
      },
    };

    console.log("✅ Successfully retrieved domains");
    return response;
  },
  {
    query: ListDomainsQuery,
    response: {
      200: ListDomainsResponse,
      401: ErrorResponse,
      500: ErrorResponse,
    },
    detail: {
      tags: ["Domains"],
      summary: "List all domains",
      description:
        "Get paginated list of domains for authenticated user with optional filtering.",
    },
  }
);

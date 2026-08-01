import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const user = pgTable("user", {
	id: text('id').primaryKey(),
	name: text('name').notNull(),
	email: text('email').notNull().unique(),
	emailVerified: boolean('email_verified').$defaultFn(() => false).notNull(),
	image: text('image'),
	createdAt: timestamp('created_at').$defaultFn(() => /* @__PURE__ */ new Date()).notNull(),
	updatedAt: timestamp('updated_at').$defaultFn(() => /* @__PURE__ */ new Date()).notNull(),
	role: text('role'),
	banned: boolean('banned'),
	banReason: text('ban_reason'),
	banExpires: timestamp('ban_expires'),
	stripeCustomerId: text('stripe_customer_id'),
	webhooksToEndpointsMigrated: boolean('webhooks_to_endpoints_migrated').default(false),
	// Feature flags - array of enabled feature flags
	featureFlags: text('feature_flags'), // JSON array of feature flag strings
	// SVIX webhook service integration
	svixAppId: text('svix_app_id'), // SVIX application ID for sent email event webhooks
});

export const session = pgTable("session", {
	id: text('id').primaryKey(),
	expiresAt: timestamp('expires_at').notNull(),
	token: text('token').notNull().unique(),
	createdAt: timestamp('created_at').notNull(),
	updatedAt: timestamp('updated_at').notNull(),
	ipAddress: text('ip_address'),
	userAgent: text('user_agent'),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	impersonatedBy: text('impersonated_by')
});

export const account = pgTable("account", {
	id: text('id').primaryKey(),
	accountId: text('account_id').notNull(),
	providerId: text('provider_id').notNull(),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	accessToken: text('access_token'),
	refreshToken: text('refresh_token'),
	idToken: text('id_token'),
	accessTokenExpiresAt: timestamp('access_token_expires_at'),
	refreshTokenExpiresAt: timestamp('refresh_token_expires_at'),
	scope: text('scope'),
	password: text('password'),
	createdAt: timestamp('created_at').notNull(),
	updatedAt: timestamp('updated_at').notNull()
});

export const verification = pgTable("verification", {
	id: text('id').primaryKey(),
	identifier: text('identifier').notNull(),
	value: text('value').notNull(),
	expiresAt: timestamp('expires_at').notNull(),
	createdAt: timestamp('created_at').$defaultFn(() => /* @__PURE__ */ new Date()),
	updatedAt: timestamp('updated_at').$defaultFn(() => /* @__PURE__ */ new Date())
});

export const apikey = pgTable("apikey", {
	id: text('id').primaryKey(),
	configId: text('config_id').notNull().default('default'),
	name: text('name'),
	start: text('start'),
	referenceId: text('reference_id').notNull(),
	prefix: text('prefix'),
	key: text('key').notNull(),
	userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
	refillInterval: integer('refill_interval'),
	refillAmount: integer('refill_amount'),
	lastRefillAt: timestamp('last_refill_at'),
	enabled: boolean('enabled').default(true),
	rateLimitEnabled: boolean('rate_limit_enabled').default(true),
	rateLimitTimeWindow: integer('rate_limit_time_window').default(86400000),
	rateLimitMax: integer('rate_limit_max').default(10),
	requestCount: integer('request_count'),
	remaining: integer('remaining'),
	lastRequest: timestamp('last_request'),
	expiresAt: timestamp('expires_at'),
	createdAt: timestamp('created_at').notNull(),
	updatedAt: timestamp('updated_at').notNull(),
	permissions: text('permissions'),
	metadata: text('metadata')
}, (table) => [
	index('apikey_config_id_idx').on(table.configId),
	index('apikey_reference_id_idx').on(table.referenceId),
	index('apikey_key_idx').on(table.key),
]);

// Passkey table for WebAuthn/FIDO2 authentication
// See: https://www.better-auth.com/docs/plugins/passkey
export const passkey = pgTable("passkey", {
	id: text('id').primaryKey(),
	name: text('name'),
	publicKey: text('public_key').notNull(),
	userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
	credentialID: text('credential_id').notNull(),
	counter: integer('counter').notNull(),
	deviceType: text('device_type').notNull(),
	backedUp: boolean('backed_up').notNull(),
	transports: text('transports'),
	createdAt: timestamp('created_at').$defaultFn(() => new Date()),
	aaguid: text('aaguid'),
}, (table) => [
	index('passkey_user_id_idx').on(table.userId),
	index('passkey_credential_id_idx').on(table.credentialID),
]);

export const deviceCode = pgTable(
	"device_code",
	{
		id: text("id").primaryKey(),
		deviceCode: text("device_code").notNull(),
		userCode: text("user_code").notNull(),
		userId: text("user_id").references(() => user.id, {
			onDelete: "cascade",
		}),
		expiresAt: timestamp("expires_at").notNull(),
		status: text("status").notNull(),
		lastPolledAt: timestamp("last_polled_at"),
		pollingInterval: integer("polling_interval"),
		clientId: text("client_id"),
		scope: text("scope"),
	},
	(table) => [
		uniqueIndex("device_code_device_code_idx").on(table.deviceCode),
		uniqueIndex("device_code_user_code_idx").on(table.userCode),
		index("device_code_user_id_idx").on(table.userId),
		index("device_code_expires_at_idx").on(table.expiresAt),
	],
);

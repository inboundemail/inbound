import {
  boolean,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const mailboxSelectionMode = pgEnum("mailbox_selection_mode", [
  "all",
  "selected",
]);

export const mailAccounts = pgTable(
  "mail_accounts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    inboundUserId: text("inbound_user_id").notNull(),
    onboardingVersion: integer("onboarding_version").default(0).notNull(),
    onboardedAt: timestamp("onboarded_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("mail_accounts_inbound_user_id_unique").on(
      table.inboundUserId,
    ),
  ],
);

export const mailboxConfigs = pgTable(
  "mailbox_configs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => mailAccounts.id, { onDelete: "cascade" }),
    inboundDomainId: text("inbound_domain_id").notNull(),
    domain: text("domain").notNull(),
    enabled: boolean("enabled").default(true).notNull(),
    selectionMode: mailboxSelectionMode("selection_mode")
      .default("all")
      .notNull(),
    defaultFromAddress: text("default_from_address"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("mailbox_configs_account_domain_unique").on(
      table.accountId,
      table.inboundDomainId,
    ),
    index("mailbox_configs_account_id_idx").on(table.accountId),
  ],
);

export const mailboxAddresses = pgTable(
  "mailbox_addresses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    mailboxConfigId: uuid("mailbox_config_id")
      .notNull()
      .references(() => mailboxConfigs.id, { onDelete: "cascade" }),
    address: text("address").notNull(),
    displayName: text("display_name"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("mailbox_addresses_config_address_unique").on(
      table.mailboxConfigId,
      table.address,
    ),
    index("mailbox_addresses_config_id_idx").on(table.mailboxConfigId),
  ],
);

export const mailSyncStates = pgTable(
  "mail_sync_states",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => mailAccounts.id, { onDelete: "cascade" }),
    scopeKey: text("scope_key").notNull(),
    cursor: text("cursor"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("mail_sync_states_account_scope_unique").on(
      table.accountId,
      table.scopeKey,
    ),
    index("mail_sync_states_account_id_idx").on(table.accountId),
  ],
);

export type MailAccount = typeof mailAccounts.$inferSelect;
export type NewMailAccount = typeof mailAccounts.$inferInsert;
export type MailboxConfig = typeof mailboxConfigs.$inferSelect;
export type NewMailboxConfig = typeof mailboxConfigs.$inferInsert;
export type MailboxAddress = typeof mailboxAddresses.$inferSelect;
export type NewMailboxAddress = typeof mailboxAddresses.$inferInsert;
export type MailSyncState = typeof mailSyncStates.$inferSelect;
export type NewMailSyncState = typeof mailSyncStates.$inferInsert;

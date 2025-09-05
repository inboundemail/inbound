import { vipConfigs, vipPaymentSessions, vipAllowedSenders, vipEmailAttempts, userAccounts } from '@/lib/db/schema'

// Primary types from schema
export type VipConfig = typeof vipConfigs.$inferSelect
export type NewVipConfig = typeof vipConfigs.$inferInsert

export type VipPaymentSession = typeof vipPaymentSessions.$inferSelect
export type NewVipPaymentSession = typeof vipPaymentSessions.$inferInsert

export type VipAllowedSender = typeof vipAllowedSenders.$inferSelect
export type NewVipAllowedSender = typeof vipAllowedSenders.$inferInsert

export type VipEmailAttempt = typeof vipEmailAttempts.$inferSelect
export type NewVipEmailAttempt = typeof vipEmailAttempts.$inferInsert

export type UserAccount = typeof userAccounts.$inferSelect
export type NewUserAccount = typeof userAccounts.$inferInsert

// Action-specific types
export type UpdateVipConfigData = {
  price?: string
  expirationHours?: string
  allowAfterPayment?: boolean
  customMessage?: string
}

export type VipEmailAttemptWithSession = {
  attempt: VipEmailAttempt
  paymentSession: VipPaymentSession | null
  vipConfig: VipConfig | null
  emailAddress: any // From emailAddresses table
}

// VIP status enums
export const VIP_EMAIL_ATTEMPT_STATUS = {
  PAYMENT_REQUIRED: 'payment_required',
  ALLOWED: 'allowed',
  BLOCKED: 'blocked'
} as const

export const VIP_PAYMENT_STATUS = {
  PENDING: 'pending',
  PAID: 'paid',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled'
} as const

export const VIP_ALLOWED_REASON = {
  PREVIOUS_PAYMENT: 'previous_payment',
  PAYMENT_COMPLETED: 'payment_completed',
  WHITELISTED: 'whitelisted'
} as const

// Component props types
export type VipEmailAttemptsProps = {
  attempts: VipEmailAttemptWithSession[]
  pagination?: {
    total: number
    limit: number
    offset: number
    hasMore: boolean
  }
}

export type VipAccountSettingsProps = {
  hasVipByok: boolean
  accountStripeKey: string | null
  onUpdateStripeKey: (key: string) => Promise<void>
} 
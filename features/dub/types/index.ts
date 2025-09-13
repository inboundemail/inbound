import { dubIntegrations } from '@/lib/db/schema'

export type DubIntegration = typeof dubIntegrations.$inferSelect
export type NewDubIntegration = typeof dubIntegrations.$inferInsert

export type DubLinkStatus = {
  linked: boolean
  workspaceName?: string | null
  updatedAt?: string | null
}



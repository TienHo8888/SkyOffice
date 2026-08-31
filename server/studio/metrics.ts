export const SOCIAL_METRIC_NAMES = [
  'social_daily_claim',
  'social_round_started',
  'social_round_finished',
  'social_round_abandoned',
  'social_reward_granted',
  'social_reward_duplicate',
  'social_wallet_rejected',
  'cosmetic_purchase',
  'property_visit',
  'property_like',
  'property_gift',
  'social_trade',
  'casino_wager_placed',
  'casino_round_settled',
] as const

export type SocialMetricName = typeof SOCIAL_METRIC_NAMES[number]
export type SocialMetricMetadata = Record<string, string | number | boolean | undefined>

interface SocialMetricEvent {
  name: SocialMetricName
  metadata: SocialMetricMetadata
  createdAt: string
}

const counts = new Map<SocialMetricName, number>()
const recentEvents: SocialMetricEvent[] = []
const MAX_RECENT_EVENTS = 1_000

export function recordSocialMetric(name: SocialMetricName, metadata: SocialMetricMetadata = {}): void {
  counts.set(name, (counts.get(name) || 0) + 1)
  recentEvents.push({ name, metadata: { ...metadata }, createdAt: new Date().toISOString() })
  if (recentEvents.length > MAX_RECENT_EVENTS) recentEvents.shift()
}

export function getSocialMetricSnapshot() {
  return {
    counts: Object.fromEntries(SOCIAL_METRIC_NAMES.map((name) => [name, counts.get(name) || 0])) as Record<SocialMetricName, number>,
    recentEvents: recentEvents.map((event) => ({ ...event, metadata: { ...event.metadata } })),
  }
}

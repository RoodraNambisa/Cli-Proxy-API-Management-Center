import { apiClient } from './client';
import i18n from '@/i18n';

// Old backends ignore unknown selectors, which would widen a credential rule.
export async function requireRoutingCredentialSupport(rules: unknown): Promise<void> {
  if (
    !Array.isArray(rules) ||
    !rules.some((rule) => {
      const items = rule?.['subscription-overrides'] ?? rule?.subscriptionOverrides;
      return (
        Array.isArray(items) &&
        items.some((item) => Array.isArray(item?.credentials) && item.credentials.length > 0)
      );
    })
  )
    return;
  try {
    const result = await apiClient.get<{ features?: { credential_request_limits?: boolean } }>(
      '/routing/priority-overrides'
    );
    if (result.features?.credential_request_limits === true) return;
  } catch {
    /* Use a clear compatibility message for missing capability endpoints. */
  }
  throw new Error(i18n.t('routing_credentials.upgrade'));
}

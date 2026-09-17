## 2025-05-18 - Input Validation on Automated Cron Parameters
**Vulnerability:** Unvalidated negative numbers passed to date offsets in cron tasks (`checkOverdueAndSuspendAccounts`) resulted in reference dates shifted into the future, causing non-overdue active accounts to be erroneously suspended.
**Learning:** Cron/automation HTTP endpoints that accept timeframe thresholds must strictly validate parameters for non-negative integers both in route handlers and service logic.
**Prevention:** Always sanitize and enforce `typeof days === 'number' && Number.isFinite(days) && days >= 0` for date offset parameters.

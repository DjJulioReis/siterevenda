# Sentinel Security Journal

## 2025-05-18 - Input Validation on Date-Based Automation Parameters
**Vulnerability:** The `/api/cron/check-suspensions` endpoint and `HostingService.checkOverdueAndSuspendAccounts` accepted arbitrary `days` input without validation. Negative integers resulted in future reference dates (`today - (-X) = today + X`), causing immediate mass suspension of active accounts with future pending invoices. Non-numeric input resulted in `NaN` dates and unhandled `RangeError` exceptions.
**Learning:** Cron/automation helper endpoints that accept offset or threshold parameters must strictly validate inputs as non-negative integers before performing date arithmetic or DB queries.
**Prevention:** Validate `Number.isInteger(days) && days >= 0` both at the API boundary and in service layer functions before computing date offsets.

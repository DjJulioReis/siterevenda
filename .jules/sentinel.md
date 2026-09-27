## 2025-05-18 - Parameter Validation for Relative Date Calculation Endpoints
**Vulnerability:** Passing negative integer parameters to date-subtraction routines (`today - daysThreshold`) allowed reference dates in the future to be generated, causing active accounts with pending future invoices to be improperly flagged as overdue and suspended.
**Learning:** Endpoints that accept relative day offsets for automated background jobs (such as cron handlers) must strictly enforce non-negative integer parameter constraints at both the HTTP routing layer and the domain service layer.
**Prevention:** Always validate numeric range inputs (`Number.isInteger(val) && val >= 0`) when performing date arithmetic or filter offsets.

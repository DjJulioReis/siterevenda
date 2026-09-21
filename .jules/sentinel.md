## 2025-05-10 - Negative Date Offsets in Overdue Suspension Logic
**Vulnerability:** Unvalidated `days` input in automated cron suspension checks allowed negative values, shifting date threshold calculations into the future and causing active accounts with pending future invoices to be improperly suspended.
**Learning:** Date difference calculations using subtraction (`today - days`) must always validate that input offset parameters are finite, non-negative integers.
**Prevention:** Enforce strict type and range validation (`Number.isFinite(days) && Number.isInteger(days) && days >= 0`) on all input parameters used in date arithmetic before running DB queries.

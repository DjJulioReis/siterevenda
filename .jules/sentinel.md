## 2025-05-18 - Input Validation on Relative Date/Time Parameters
**Vulnerability:** Accepting unvalidated or negative numbers as relative day/time offsets (e.g. `days = -10`) shifts target reference dates into the future, causing automated cron/batch queries (`due_date <= refDate`) to match non-overdue items and trigger unintended mass account suspensions.
**Learning:** Date calculation routines using offsets (`refDate.setDate(refDate.getDate() - days)`) must strictly enforce non-negative integer inputs.
**Prevention:** Always validate that relative time/day offset parameters are finite, non-negative integers (`typeof days === 'number' && days >= 0 && Number.isInteger(days)`).

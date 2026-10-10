# OddKar Project Checkpoint

## Project State
**Repository Branch:** `feature/oddkar-phase-5b-checkpoint`
**Stack:** Node.js, Express, MongoDB (Mongoose)

## Implemented Phases and Major Features
- **Phase 1 & 1.1:** Financial Settlement Integrity & Recovery. Fixed commission arithmetic and diagnostic subsidy cap. Implemented non-destructive atomic recovery via `expiryWorker` using idempotent settlement logic.
- **Phase 2:** API Financial Privacy & Legacy Protection. Enforced role-aware API serialization (`bookingSerializer`) protecting internal margins/commission from public exposure. Hardened legacy `PATCH` endpoints.
- **Phase 3.1 & 3.1.1:** Double-Entry Accounting. Introduced a strict, balanced, immutable double-entry `JournalTransaction` model synchronized perfectly with `LedgerEntry` using strict constraints (integer-paise arithmetic only).

## Current Account Mapping
- `1010`: Payment Clearing / Gateway (Asset)
- `1020`: Customer Receivable (Asset)
- `2010`: Provider Payable — Labour (Liability)
- `2020`: Provider Payable — Materials (Liability)
- `4010`: Platform Commission Revenue (Revenue)
- `5010`: Promotional Subsidy Expense (Expense)

## Financial Business Rules
- **Commission:** OddKar earns exactly 20% on eligible labour charges only. Materials are strict pass-through and excluded from commission.
- **Subsidies:** First-time diagnostic inspection is subsidized up to exactly ₹99 (9,900 paise). Subsequent approved repair labour is NEVER subsidized by the inspection promotion.

## Business Decisions & Policies
- **Payment Model:** Online payments ONLY for the initial release. Absolutely no cash-on-delivery (COD) supported.
- **Verification:** Provider verification is strictly required before eligibility for paid jobs, settlements, and linked account creation.
- **Cancellations & Refunds:** A full refund is issued if cancelled before provider travel (under proposed policy). Later cancellations, on-site disputes, and post-service adjustments mandate explicit admin review. Do not automatically deduct disputed amounts from provider earnings.

## Not Yet Implemented (Next Phases)
- Payment Gateway integration (Razorpay/Stripe).
- Verified payment webhook handlers.
- `Payment` and `Order` MongoDB schemas.
- Customer Advance (`2030`) liability logic for pre-service captured funds.
- Production payouts, automated bank debits, refund API integrations, and tax deduction (TDS) mechanics.
- Production activation.
- Mobile provider screens are currently completely disjointed and still use mock data; they lack integration with the actual backend API workflow.

## Next Steps Upon Resumption
**Exact next step:** Plan and implement the payment gateway integration (Phase 3.2) entirely within a SANDBOX environment. **No live payment processing** should be attempted until marketplace eligibility, provider KYC friction, and formal platform onboarding have been verified and confirmed.

## Testing & Verification
### Exact Commands
To resume work and verify the integrity of the project:
```bash
git checkout feature/oddkar-phase-5b-checkpoint
cd server
npm install
node scratch/test_journal.js
node scratch/test_phase5b.js
node scratch/run_tests.js
node scratch/test_job_requests.js
```

### Actual Test Results (Verified)
The following isolated unit and integration test suites were run on a local `MongoMemoryServer`:
- `node scratch/test_journal.js`: **29 PASSED**, 0 FAILED
- `node scratch/test_phase5b.js`: **191 PASSED**, 0 FAILED
- `node scratch/run_tests.js`: **28 PASSED**, 0 FAILED
- `node scratch/test_job_requests.js`: **29 PASSED**, 0 FAILED

### Unresolved Risks & Limitations
- **No Replica-Set Transaction Testing:** All test verifications were strictly non-transactional (simulated double-writes resolving gracefully via idempotent `E11000` recovery). Real multi-document transactions were NOT tested due to the lack of a running replica-set environment.
- **Provider Friction:** Mandating gateway-linked accounts for gig-economy workers introduces significant KYC onboarding friction which has not yet been addressed in product flows.

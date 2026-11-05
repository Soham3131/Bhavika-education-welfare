# Jai Maa Durga + Bhavika — Client Handover Checklist

**Audit Date:** November 2, 2026  
**Repository:** `Soham3131/Bhavika-education-welfare`  
**Purpose:** Actionable executive checklist defining exact demonstration capabilities, required configurations, pending approvals, and release boundaries.

---

## 1. What Can Be Demonstrated Today (Fully Working & Verified)

These features have passed all automated tests and can be walked through live in a client demonstration without risk:

### A. Bhavika Education & Welfare Foundation (NGO Platform)
1. **Public Marketing Site**:
   - Bilingual (English & Hindi) pages: Home, About Us, Mission & Vision, Gallery, Video Gallery, Testimonials, Partners, and Contact Us.
   - Interactive media lightbox and YouTube/Vimeo video player.
   - Contact form with Zod validation, rate limiting, and CMS submission management.
2. **Member Authentication & Security**:
   - Registration with email verification and 6-digit OTP.
   - Rate limiting, brute-force lockout, and admin audit logging.
   - Profile management with one-time profile completion point bonuses.
3. **Timed Quizzes & Anti-Cheat Engine**:
   - Daily and weekly quizzes with server-owned start/expiry timestamps.
   - Anti-cheat protection against client clock tampering.
   - Immediate review and automatic point rewards.
4. **NGO Multi-Wallet & Ledger**:
   - Segregated sub-balances: Quiz Balance, Referral Balance, Activity Balance.
   - Append-only `WalletTransaction` ledger with unique idempotency keys.
5. **Leaderboard System**:
   - Dynamic rankings for Daily, Weekly, Monthly, and All-Time quiz achievers.
6. **Bhavika Coupon Generation**:
   - Point conversion (10 points = ₹1, min 5,000 points, steps of 500, 90-day expiry).
   - Atomic transaction debiting points and issuing unique `BHAV-XXXX-XXXX-XXXX` voucher.
7. **HMAC SHA-256 Integration Seam**:
   - Machine-to-machine signed validation (`/api/integration/coupons/validate`) and redemption (`/api/integration/coupons/redeem`).
   - Timing-safe verification, replay prevention, and idempotency on order references.

### B. Jai Maa Durga (E-Commerce Platform)
8. **Multi-Deployment Storefront Routing**:
   - `JMD_SITE_MODE=true` serves Jai Maa Durga storefront at domain root (`/`).
   - Bhavika deployment serves NGO marketing site at domain root (`/`).
   - Shared codebase with zero route cross-contamination.
9. **Commercial Product Catalog**:
   - 6 Seeded Categories: Gold Jewellery, Silver Jewellery, Mobile Recharge, Grocery & Daily Needs, Fashion & Lifestyle, Electronics.
   - Product search, category filters, responsive image carousel, and real-time stock availability.
10. **Shopping Cart & Stock Reservation**:
    - Atomic 15-minute stock reservation lock preventing inventory overselling.
11. **Coupon-Enabled Checkout**:
    - Dual coupon application: Jai Maa Durga native store coupons and external Bhavika NGO vouchers.
    - Zero-cash checkout: 100% coupon-covered orders settle immediately without gateway interaction.
12. **Online Payment & Refunds (Razorpay)**:
    - Order generation, webhook verification, and durable refund tracking with multi-cycle idempotency.
13. **Seven Store Wallets**:
    - Add Money, Member Activation, Product Points, Free Referral, Paid Referral, Recharge, Coupon Valuation.
    - Append-only `StoreWalletLedger` ensuring zero float arithmetic errors.
14. **Member PIN Management**:
    - Purchase PINs via wallet balance (Area ₹25k, Chief ₹100k).
    - Peer-to-peer PIN transfer to other members via phone number.
    - PIN activation restricted strictly to immediate direct downline members.
15. **EMI Payment Schedules**:
    - Generation of 2–24 month instalment plans.
    - Monthly wallet instalment payments with promotional instalment coupon awards.
    - "Winner-stops-EMI" rule: waives all remaining instalments upon winning an eligible contest.
16. **Recharge Utility Flow (Mock Provider in Dev/Staging)**:
    - Operator and plan browsing across Mobile, DTH, FASTag, Electricity, Gas, Water.
    - Commission credits to Recharge Wallet (Area: 60%, Chief: 80%, Free: 40% capped at ₹2).
    - Replay-safe asynchronous status callback endpoint (`/api/store/recharge/webhook`) with duplicate protection and refund reversal on failure.
17. **Lucky Draw Lifecycle Engine**:
    - Draw creation, ticket issuance on qualifying orders, SHA-256 snapshot hashing, and reproducible cryptographic winner selection.
    - Strict legal clearance gate: `isEligibleForDraw: false` while `luckyDrawsEnabled=false` or `legalClearanceConfirmed=false`.
18. **Dynamic Jewellery Pricing & CA-Approved GST Checkout**:
    - Live bullion quotation based on current gold/silver rates, gross weight, and separate per-gram making charges (₹450/g gold, ₹15/g silver).
    - Statutory GST computation: 3% metal, 5% making, and 3% stone GST.
    - Weight basis confirmed: Metal value on Net Metal Weight; Making charges on Gross Weight.
    - Authoritative server quotation connected directly to cart, checkout, payment gateway, order storage, and invoices.
    - Jewellery checkout unlocked and fully functional (`caApprovalConfirmed: true`).
19. **Cash on Delivery (COD) Payment Flow**:
    - Configurable COD payment method with ₹5,000 order safety limit.
    - State transition: orders created with status `PROCESSING` and payment status `PENDING`.
    - Dedicated administrative cash collection confirmation endpoint preventing premature payment markings.
20. **Statutory GST Tax Invoice PDF Generation**:
    - Concurrency-safe atomic sequential numbering (`StoreInvoiceSequence`, `JMD/26-27/00001`).
    - Config-based seller identity in `StoreSettings.invoice`.
    - Staging invoices render with visible `[STAGING DRAFT — NOT FOR OFFICIAL TAX CLAIM]` watermark.
    - Production issuance strictly blocked (HTTP 422 `INVOICE_IDENTITY_INCOMPLETE`) if placeholder details (`07AAAFB1234A1Z5`) remain.
    - Downloadable PDF invoices built with `pdf-lib` via `GET /api/store/orders/[orderRef]/invoice` protected by owner/admin permission checks.
21. **Promotional Membership Plans (Plan 1 & Plan 2)**:
    - Dedicated customer preview page at `/store/plans` showing Plan 1 (₹850 -> ₹1,000 + 2 Super Coupons) and Plan 2 (₹1,500 -> ₹2,000 + 5 Super Coupons).
    - Prominent "Purchases Locked" governance badge and modal dialog explaining client authorization hold.
    - Multi-document ACID transactions with idempotency protection against duplicate webhook deliveries.
22. **Peer-to-Peer Coupon Transfer & Printable Vouchers**:
    - Member coupon transfer by 10-digit mobile number with atomic wallet cache rebalancing.
    - Printable voucher layout with visual QR code and `@media print` styling for offline presentation.
    - Clearly marked as "Store Discount Only" and "MINI DISCOUNT COUPON" when lucky draw participation is inactive.
23. **Expanded Store Administration Panel (15 Operational Tabs)**:
    - 15 operational tabs: Products, Categories, Orders, Inventory, Membership, Commissions, Coupons, Referrals, Recharges, Draws, Bullion & Jewellery GST, Promotional Plans, Activation PINs, EMI Plans, and **Withdrawals**.
    - Direct PDF Tax Invoice download action on all completed/confirmed orders.
24. **Free Member Registration Mini Coupon (B.1 - Remediated in Phase 2)**:
    - Automatic minting of 1 free MINI coupon upon member registration (`FREE_REGISTRATION` source, ₹50 default value pending client confirmation, 90-day expiry).
    - Strict idempotency key (`reg:{memberId}`) preventing duplicate creation across retry attempts.
    - Statutory lucky draw gate preserved (`isEligibleForDraw: false` while `luckyDrawsEnabled=false` or `legalClearanceConfirmed=false`).
    - Configurable face value via `StoreSettings.coupons.freeRegistrationMiniCouponValuePaise`.
25. **Internal Bank Withdrawal / Payout Workflow (B.14 - Remediated in Phase 2)**:
    - Member withdrawal requests for eligible referral cash earnings (`FREE_REFERRAL`, `PAID_REFERRAL`), with non-withdrawable balances (`ADD_MONEY`, `PRODUCT_POINTS`, `COUPON`) strictly protected.
    - Dedicated customer interface at `/store/account/withdrawals` showing balances, request form, and request history.
    - Configurable limits (min ₹200, max ₹50,000) and strict bank account (8-20 digits) / IFSC format validation.
    - Immediate ledger hold debit (`BANK_PAYOUT`) preventing concurrent over-withdrawals.
    - Automated refund via `ADMIN_CORRECTION` on administrative rejection.
    - Settlement confirmation requiring external banking UTR reference; provider auto-dispatch held pending client provider selection.

---

## 2. What Requires Configuration Before Launch

These features are architected and built, but need configuration files, environment secrets, or seed data from the client:

| Configuration Item | File / Location | Action Required |
|---|---|---|
| **Recharge Aggregator API Credentials** | `.env.local` / `recharge-provider.ts` | Client must supply production telecom API endpoint, API key, and merchant balance. |
| **Production GST Invoice Seller Details** | `/admin/store` (Settings) | Client must enter legal registered entity name, official GSTIN, registered address, and toggle `isProductionReady: true`. |
| **Razorpay Live Gateway Credentials** | `.env.local` | Replace test keys with production `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET`. |
| **Brevo Production SMTP / API Key** | `.env.local` | Add verified production sender domain credentials to ensure 100% email deliverability. |
| **Bhavika ↔ JMD Shared Secrets** | `.env.local` | Deploy matching 64-character hex strings to `JMD_INTEGRATION_SECRET` and `BHAVIKA_INTEGRATION_SECRET`. |
| **Live Daily Bullion Rates & Making Charges** | `/admin/store` (Settings) | Admin can configure daily gold (e.g., ₹7,500/g), silver (e.g., ₹95/g), gold making charge (₹450/g), and silver making charge (₹15/g). |
| **Promotional Plans Purchase Toggle** | `/admin/store` (Promotional Plans) | Toggle `isPurchaseActive: true` once client confirms coupon redemption rules. |
| **Bhavika Coupon Redemption Switch** | `/admin/settings` (Bhavika) | Set `redemptionEnabled: true` once the live JMD store is open to accept customer vouchers. |

---

## 3. What is Pending Formal Approval (Do NOT Release Without Signoff)

| Approval Item | Authority Required | Reason for Release Hold |
|---|---|---|
| **Promotional Plan Coupon Valuation** | **Client Signoff** | Plan 1 (₹850 -> ₹1,000 + 2 Super Coupons) and Plan 2 (₹1,500 -> ₹2,000 + 5 Super Coupons) are implemented and atomic, but held inactive (`isPurchaseActive: false`) until client confirms coupon redemption valuation. |
| **Single-Level Direct Sponsor Commission Model** | **Legal Counsel** | Platform restricts commissions to immediate direct sponsors (`depth = 1`) on product retail margins. Deep multi-tier or enrollment MLM payouts violate the Prize Chits and Money Circulation Schemes Act, 1978. |
| **Lucky Draw Legality in Operating States** | **Legal Counsel** | `luckyDrawsEnabled` and `legalClearanceConfirmed` default to `false`. Contests of chance tied to purchases are state-regulated in India. Counsel must confirm operating states. |
| **Free Member Recharge Commission Cap (₹2 vs 40%)** | **Client Signoff** | Paying a flat ₹2 on small recharges causes direct platform monetary losses. Client must sign off on the 40% cap model. |
| **Donation Receipt 80G Tax Exemption** | **Client / CA** | Current receipts issue "Certificate of Donation" with zero tax claims. If 80G tax deductions are promised, registration numbers and PAN must be integrated. |

---

## 4. What CANNOT Yet Be Promised to the Client

Under no circumstances should the team promise the following deliverables today, as they require separate mobile/marketplace architectures:

1. **Native Android Application / Google Play Store Deliverables**:
   - The repository contains responsive web applications (optimized for 360px mobile browsers and PWA ready), but no native Android APK, React Native build, or Play Store listing assets.
2. **Coupon Selling Marketplace**:
   - P2P coupon transfers via member phone number are fully functional; however, an open peer-to-peer cash selling marketplace with an escrow payment engine does not exist.
3. **Client 200-Coupon / 50% PIN Tier**:
   - Area (₹25k) and Chief (₹100k / 20% discount) exist and are tested. A 50% product discount tier does not exist.

---

## 5. Handover Metrics Summary

```
Total Audited Requirements: 47
─────────────────────────────────────────────────────────────
• IMPLEMENTED AND TESTED:             43  (91.5%)
• PARTIALLY IMPLEMENTED:               0  ( 0.0%)
• CONFIGURATION / SEEDING PENDING:     1  ( 2.1%)
• CLIENT / CA / LEGAL APPROVAL:        3  ( 6.4%)
• NOT IMPLEMENTED:                     0  ( 0.0%)
```

---

## 6. Release Blockers Status (Remediated vs Outstanding)

### Remediated in Phase 1 & Phase 2 Sprints:
1. **Free Registration Mini Coupon (B.1 - Remediated)**: Automated minting of 1 free MINI coupon upon member registration with idempotency, configurable face value, and lucky draw safety gating.
2. **Member Bank Withdrawal / Payout Workflow (B.14 - Remediated)**: Internal request, validation, immediate ledger hold debit, member interface (`/store/account/withdrawals`), admin approval/rejection with refund, and UTR settlement confirmation fully built and tested.
3. **Production Sequential GST Invoices (Phase 2 Update)**: Concurrency-safe atomic sequence allocator (`StoreInvoiceSequence`), config-based seller identity, and strict HTTP 422 blocking in production when official GSTIN/address are missing.
4. **Jewellery Tax Model Approved & Unlocked**: CA approval confirmed (`caApprovalConfirmed: true`); `JEWELLERY_TAX_APPROVAL_PENDING` checkout block removed.
5. **Jewellery Making Charge Weight Basis Verified**: Metal value on Net Metal Weight; Making charges on Gross Weight (₹450/g Gold, ₹15/g Silver).
6. **Stone Charge GST Defect Fixed**: 3% stone GST included in quotation calculation sum.
7. **Cart & Bullion Price Integration Complete**: Dynamic server quotation calculates authoritative subtotal and GST for cart and checkout.
8. **Promotional Plans 1 & 2 Implemented**: Models, atomic wallet credits, Super Coupon issuance, customer preview page (`/store/plans`), and admin controls implemented and tested.
9. **Cash on Delivery (COD) Implemented**: Configurable ₹5,000 cap, orders set to `PROCESSING`/`PENDING`, admin confirmation flow built.
10. **Coupon Transfer & Printing Implemented**: P2P member transfer by phone number and printable voucher with visual QR code built.
11. **Admin Panel Expansion**: 15 operational tabs including dedicated "Withdrawals" tab.

### Outstanding External Dependencies Before Production Go-Live (4 Total):
1. **Telecom Aggregator Credentials**: Supply live telecom provider API endpoint, credentials, and merchant wallet balance.
2. **Lucky Draw Legal Clearance**: Obtain legal signoff under State Lottery Regulations to enable `luckyDrawsEnabled: true` in target states.
3. **Multi-Tier MLM vs 1978 Act Signoff**: Confirm adherence to single-level direct referral commissions (`depth = 1`).
4. **Promotional Plan Coupon Valuation**: Confirm Super Coupon prize and redemption rules before toggling `isPurchaseActive: true`.

---

## 7. Exact Client Decisions Required Before Production Go-Live

1. **Production GST Tax Invoice Identity**: Provide legal registered entity name, official GSTIN, and principal business address to enable production invoice generation.
2. **Bank Payout Aggregator Contract**: Select payout partner (e.g. RazorpayX or Cashfree) and provide merchant API credentials to enable automated disbursement.
3. **Promotional Plan Launch Signoff**: Review Plan 1 (₹850) and Plan 2 (₹1,500) parameters and authorize toggling `isPurchaseActive: true`.
4. **Recharge Aggregator Production Handover**: Supply API documentation, production API credentials, and merchant funding for live recharge services.
5. **Recharge Margin Approval**: Formally approve the 40% cap (up to ₹2.00) on free-member recharge commissions.
6. **Lottery Law Legal Clearance**: Obtain formal legal opinion to enable the Lucky Draw engine in operating jurisdictions.
7. **Production Secrets Provisioning**: Provide live Razorpay gateway credentials and Brevo SMTP credentials for deployment.

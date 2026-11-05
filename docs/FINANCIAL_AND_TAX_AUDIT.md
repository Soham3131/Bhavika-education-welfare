# Jai Maa Durga + Bhavika — Financial and Tax Audit Report

**Audit Date:** November 2, 2026  
**Repository:** `Soham3131/Bhavika-education-welfare`  
**Priority:** Highest Priority Operational & Regulatory Audit  
**Scope:** Production Code, Schemas, Seed/Configuration Files, Admin Screens, Tax Calculations, and Statutory Gates.

---

## 1. Special Financial Audit — 10 Key Requirements

This section provides an itemized audit of the 10 specific financial and commission rules stipulated in the client documents, answering the 7 required audit questions for each item.

---

### Item 1: Plan 1 (₹850 Payment -> ₹1,000 Product Wallet + 2 Super Coupons)
- **Client Requirement**: Member pays ₹850; receives ₹1,000 credit in their product wallet and 2 Super Coupons for prize draws.
- **Audit Findings**:
  1. **Is the value actually configured?** **YES**. Configured in `StorePromotionalPlan` (code `PLAN_850`, price 85,000 paise = ₹850, product wallet benefit 100,000 paise = ₹1,000, 2 Super Coupons of type `SUPER`).
  2. **Is it hardcoded or admin-editable?** **Admin-editable** via `/api/admin/store/promotional-plans` and `/admin/store` "Promotional Plans" management tab with full audit logging.
  3. **Can the customer purchase or trigger it in the UI?** **Gated (Built & Ready)**. API endpoints (`/api/store/promotional-plans`, `/api/store/promotional-plans/purchase`) and UI components exist, but purchases are gated behind `isPurchaseActive: false` until the client confirms business rules and coupon redemption valuation.
  4. **Is the backend calculation correct?** **YES**. `purchasePromotionalPlan()` in `promotional-plan.service.ts` uses `withStoreTransaction` for atomic execution: debits `ADD_MONEY` or gateway balance, credits ₹1,000 to `PRODUCT_POINTS` (product wallet), generates 2 unique `StoreCoupon` vouchers of type `SUPER`, and logs immutable ledger entries.
  5. **Does it have automated tests?** **YES**. Covered by integration tests in `src/tests/jewellery-tax-cod-plans.test.ts`.
  6. **Is actual payout/settlement enabled, disabled or gated?** **GATED**. Execution engine is completely built and transaction-safe; activation switch `isPurchaseActive` is set to `false` until client provides written confirmation of coupon valuation rules.
  7. **Does it need explicit client approval?** **YES (Valuation Signoff)**. The 17.6% instant wallet bonus (₹150 bonus) and prize coupon rules require formal business signoff before toggling `isPurchaseActive: true`.

---

### Item 2: Plan 2 (₹1,500 Payment -> ₹2,000 Product Wallet + 5 Super Coupons)
- **Client Requirement**: Member pays ₹1,500; receives ₹2,000 credit in their product wallet and 5 Super Coupons.
- **Audit Findings**:
  1. **Is the value actually configured?** **YES**. Configured in `StorePromotionalPlan` (code `PLAN_1500`, price 150,000 paise = ₹1,500, product wallet benefit 200,000 paise = ₹2,000, 5 Super Coupons of type `SUPER`).
  2. **Is it hardcoded or admin-editable?** **Admin-editable** via `/api/admin/store/promotional-plans` and Admin UI tab with audit history.
  3. **Can the customer purchase or trigger it in the UI?** **Gated (Built & Ready)**. Endpoints and store integration exist, held in inactive state (`isPurchaseActive: false`) pending client business signoff.
  4. **Is the backend calculation correct?** **YES**. Multi-document ACID transaction atomically credits ₹2,000 to `PRODUCT_POINTS` wallet, mints 5 `SUPER` coupons with `MEMBERSHIP_PLAN` source, and verifies idempotency against duplicate payment IDs.
  5. **Does it have automated tests?** **YES**. Verified in `src/tests/jewellery-tax-cod-plans.test.ts`.
  6. **Is actual payout/settlement enabled, disabled or gated?** **GATED**. Transaction logic verified; purchase toggle kept disabled until client signoff.
  7. **Does it need explicit client approval?** **YES (Valuation Signoff)**. The 33.3% instant bonus credit (₹500 bonus) requires explicit client signoff on redemption restrictions.

---

### Item 3: Plan-Based Income Commission (10–20%)
- **Client Requirement**: Members earn 10% to 20% recurring income commission based on their membership plan.
- **Audit Findings**:
  1. **Is the value actually configured?** **NO**. The `StoreMembershipPlan` model has `directReferralCommissionPercentage`, but default values are 0% (Free), 5% (Area), and 8% (Chief). The 10–20% range is not configured.
  2. **Is it hardcoded or admin-editable?** **Admin-editable** via `/api/admin/store/membership` and MongoDB `store_membership_plans`.
  3. **Can the customer purchase or trigger it in the UI?** **NO**. Customers cannot trigger plan-based income distributions; commissions are derived exclusively from product sales.
  4. **Is the backend calculation correct?** **PARTIALLY**. `commission.service.ts` calculates single-level margin commissions correctly, but recursive plan-based income is not built.
  5. **Does it have automated tests?** **YES**. Single-level calculation is tested in `src/tests/store-phase-c.test.ts`.
  6. **Is actual payout/settlement enabled, disabled or gated?** **GATED**. Controlled by `commissionPayoutsEnabled` (defaults to `false` in `commission.service.ts`). Zero funds are disbursed to wallets.
  7. **Does it need explicit client approval?** **YES**. Requires legal clearance under the Prize Chits and Money Circulation Schemes (Banning) Act, 1978.

---

### Item 4: Referral Plan Commission (10–30%)
- **Client Requirement**: 10% to 30% commission paid upon referring new members into membership plans.
- **Audit Findings**:
  1. **Is the value actually configured?** **NO**. `referral.service.ts` defines `freeReferralRewardPaise = 0` and `paidReferralRewardPaise = 0`.
  2. **Is it hardcoded or admin-editable?** **Hardcoded in service defaults** (`DEFAULT_REFERRAL_CONFIG` in `referral.service.ts`).
  3. **Can the customer purchase or trigger it in the UI?** **NO**. Enrollment referral commissions do not trigger on member registration or plan qualification.
  4. **Is the backend calculation correct?** **NO**. Logic exists to credit referral wallets, but `currentReferralConfig.enabled` is hardcoded to `false`.
  5. **Does it have automated tests?** **NO** for paid plan enrollment. (Bhavika NGO referral points are tested in `src/tests/referral.test.ts`).
  6. **Is actual payout/settlement enabled, disabled or gated?** **DISABLED**. `currentReferralConfig.enabled = false` strictly disables recruitment payouts.
  7. **Does it need explicit client approval?** **YES**. Recruitment fees violate Consumer Protection (Direct Selling) Rules, 2021 unless linked directly to product sales.

---

### Item 5: Product Referral Commission (10–30%)
- **Client Requirement**: 10% to 30% direct sponsor commission on product purchases.
- **Audit Findings**:
  1. **Is the value actually configured?** **PARTIALLY**. Configured in `StoreSettings.membership.directReferralProductMarginPercent = 10` (10%). `StoreMembershipPlan` defaults to 5% for Area and 8% for Chief.
  2. **Is it hardcoded or admin-editable?** **Admin-editable** via `/api/admin/store/settings` and `StoreSettings`.
  3. **Can the customer purchase or trigger it in the UI?** **YES**. Triggered automatically when a sponsored member completes an order checkout.
  4. **Is the backend calculation correct?** **YES**. `calculateOrderDirectCommission()` correctly computes commission as a percentage of net product sales (excluding GST and shipping).
  5. **Does it have automated tests?** **YES**. Tested in `src/tests/store-phase-c.test.ts`.
  6. **Is actual payout/settlement enabled, disabled or gated?** **GATED**. Ledger entries are recorded as `PENDING`, but wallet disbursements are gated by `commissionPayoutsEnabled = false`.
  7. **Does it need explicit client approval?** **YES**. Client must confirm whether 10% global margin percent or 5%/8% tier-based rate applies.

---

### Item 6: Free Recharge Commission (₹2)
- **Client Requirement**: Free members earn ₹2 on every recharge.
- **Audit Findings**:
  1. **Is the value actually configured?** **PARTIALLY**. Configured in `storeSettingsSchema.rechargeCommissionSplits`: `freeTierPercent: 40`, `freeTierCapPaise: 200` (40% capped at ₹2.00).
  2. **Is it hardcoded or admin-editable?** **Hardcoded in function**. `recharge.service.ts` line 58 hardcodes: `Math.min(200, Math.floor(providerPayoutPaise * 0.4))`. It does not read `StoreSettings`.
  3. **Can the customer purchase or trigger it in the UI?** **YES**. Triggered when a member submits a recharge at `/store/recharge`.
  4. **Is the backend calculation correct?** **YES (Safety Model)**. Correctly prevents paying more than the aggregator payout. On a ₹0.50 payout, the member earns ₹0.20 (not ₹2.00).
  5. **Does it have automated tests?** **YES**. Tested in `src/tests/store-phase-e.test.ts`.
  6. **Is actual payout/settlement enabled, disabled or gated?** **ENABLED**. Credits `RECHARGE` wallet ledger immediately upon confirmed provider success.
  7. **Does it need explicit client approval?** **YES**. Client must formally approve the 40% cap model vs unviable flat ₹2.

---

### Item 7: Paid-Member Recharge Commission According to Plan
- **Client Requirement**: Paid members (Area / Chief) earn higher recharge commissions based on tier.
- **Audit Findings**:
  1. **Is the value actually configured?** **YES**. Area = 60%, Chief = 80% of provider payout.
  2. **Is it hardcoded or admin-editable?** **Hardcoded in function** in `recharge.service.ts` lines 50–55.
  3. **Can the customer purchase or trigger it in the UI?** **YES**. Triggered automatically for Area and Chief members on `/store/recharge`.
  4. **Is the backend calculation correct?** **YES**. Calculates integer paise accurately using `Math.floor(payout * 0.6)` and `Math.floor(payout * 0.8)`.
  5. **Does it have automated tests?** **YES**. Tested in `src/tests/store-phase-e.test.ts`.
  6. **Is actual payout/settlement enabled, disabled or gated?** **ENABLED**. Settled to `RECHARGE` wallet ledger on confirmed recharge.
  7. **Does it need explicit client approval?** **YES**. Client must confirm the 60% / 80% split ratios.

---

### Item 8: Product-Specific Points, Coupons & Commission
- **Client Requirement**: Individual products have custom point awards, coupon grants, and commission overrides.
- **Audit Findings**:
  1. **Is the value actually configured?** **NO**. `StoreProduct` schema only has `attributes?: Record<string, unknown>`. No first-class fields exist for product-specific points, coupons, or commissions.
  2. **Is it hardcoded or admin-editable?** **Global defaults only**. Points are calculated globally via `PointsConfig` (1 pt per ₹10 spent).
  3. **Can the customer purchase or trigger it in the UI?** **NO**. Only global cart totals earn points.
  4. **Is the backend calculation correct?** **PARTIALLY**. Global points accrual works, but per-product overrides are not parsed.
  5. **Does it have automated tests?** **YES (for global points)**. Tested in `src/tests/store-phase-d.test.ts`.
  6. **Is actual payout/settlement enabled, disabled or gated?** **ENABLED** for global points; non-existent for per-product overrides.
  7. **Does it need explicit client approval?** **YES**. Client must define if individual SKUs require custom commission rates.

---

### Item 9: PIN: ₹1,00,000 Example, 20% Discount & Double Coupons
- **Client Requirement**: ₹1,00,000 PIN grants 20% product discount, double coupons, and downline activation rights.
- **Audit Findings**:
  1. **Is the value actually configured?** **YES**. `PIN_TIER_PRICES.CHIEF = 10000000` (₹1,00,000.00) in `pin.service.ts`.
  2. **Is it hardcoded or admin-editable?** **Hardcoded in service** in `pin.service.ts` line 17.
  3. **Can the customer purchase or trigger it in the UI?** **YES**. Available on `/store/account/pins` for wallet balance purchase.
  4. **Is the backend calculation correct?** **YES**. Correctly debits ₹1,00,000, generates unique `JMD-PIN-2026-XXXX`, assigns 12-month validity, and allows downline member activation.
  5. **Does it have automated tests?** **YES**. Tested in `src/tests/store-phase-g.test.ts`.
  6. **Is actual payout/settlement enabled, disabled or gated?** **ENABLED**. Wallet debit and PIN generation are active.
  7. **Does it need explicit client approval?** **YES**. The 20% discount and double coupon multipliers require client confirmation on category caps (e.g. jewellery cannot support 20% discount).

---

### Item 10: Client's 200-Coupon / 50% PIN Example
- **Client Requirement**: A PIN package granting 200 coupons and a 50% product discount.
- **Audit Findings**:
  1. **Is the value actually configured?** **NO**. Completely absent from `StorePin` models and `pin.service.ts`.
  2. **Is it hardcoded or admin-editable?** **Neither**. No such tier exists.
  3. **Can the customer purchase or trigger it in the UI?** **NO**.
  4. **Is the backend calculation correct?** **N/A**.
  5. **Does it have automated tests?** **NO**.
  6. **Is actual payout/settlement enabled, disabled or gated?** **Disabled / Non-existent**.
  7. **Does it need explicit client approval?** **YES**. A 50% discount would cause catastrophic losses on electronics and jewellery.

---

## 2. Summary Table of Financial Items

| # | Requirement | Configured? | Editable? | Triggerable in UI? | Backend Correct? | Tested? | Payout Status | Client Approval? |
|---|---|---|---|---|---|---|---|---|
| 1 | Plan 1 (₹850 -> ₹1,000 + 2 Super) | ✅ Yes (`PLAN_850`) | ✅ Admin | 🔒 Gated (`isPurchaseActive: false`) | ✅ Yes (Atomic) | ✅ Yes | 🔒 Gated until coupon valuation confirmed | ⚠️ **Coupon Valuation Signoff** |
| 2 | Plan 2 (₹1,500 -> ₹2,000 + 5 Super) | ✅ Yes (`PLAN_1500`)| ✅ Admin | 🔒 Gated (`isPurchaseActive: false`) | ✅ Yes (Atomic) | ✅ Yes | 🔒 Gated until coupon valuation confirmed | ⚠️ **Coupon Valuation Signoff** |
| 3 | Plan Income Commission (10–20%) | ❌ No (5/8%) | ✅ Admin | ❌ No | ⚠️ Partial | ✅ Yes | 🔒 **Gated (false)** | ⚠️ **Legal Signoff** |
| 4 | Referral Plan Commission (10–30%) | ❌ No (0%) | ❌ Code | ❌ No | ❌ No | ❌ No | 🚫 **Disabled** | ⚠️ **Legal Signoff** |
| 5 | Product Referral Commission (10–30%)| ⚠️ Partial(10%)| ✅ Admin | ✅ Yes | ✅ Yes | ✅ Yes | 🔒 **Gated (false)** | ⚠️ **Confirm Rate** |
| 6 | Free Recharge Commission (₹2) | ⚠️ Capped | ❌ Code | ✅ Yes | ✅ Yes (Safe) | ✅ Yes | 🟢 **Enabled** | ⚠️ **Approve Cap** |
| 7 | Paid Recharge Commission | ✅ Yes (60/80%)| ❌ Code | ✅ Yes | ✅ Yes | ✅ Yes | 🟢 **Enabled** | ⚠️ **Confirm Splits** |
| 8 | Product Points/Coupons Override | ❌ Global Only| ❌ Code | ❌ No | ⚠️ Partial | ✅ Global | 🟢 **Enabled (Global)**| ⚠️ **Confirm Needs**|
| 9 | PIN ₹1,00,000 (Chief Tier) | ✅ Yes | ❌ Code | ✅ Yes | ✅ Yes | ✅ Yes | 🟢 **Enabled** | ⚠️ **Confirm Caps** |
| 10| PIN 200-Coupon / 50% Example | ❌ No | ❌ None | ❌ No | ❌ N/A | ❌ No | ❌ Non-existent | ⚠️ **Mandatory** |

---

## 3. Jewellery Tax Audit (CA Approval Obtained)

### 3.1 Statutory Framework & CA Signoff
Chartered Accountant approval has been formally obtained for the Jai Maa Durga jewellery GST tax model:
- **Precious Metals (Gold & Silver)**: Chapter 71 (HSN 7113) taxed at **3% GST** (300 basis points) on net metal value.
- **Making Charges (Job Work)**: Taxed at **5% GST** (500 basis points) on making charge value.
- **Stone / Nagina Charges**: Taxed at **3% GST** (300 basis points) on stone values.

### 3.2 Verification of Repository Implementation

#### A. Gold and Silver Tax Configuration
- Fully configured in `src/lib/validation/store-settings.ts` and `StoreSettings.jewellery`:
  - `metalGstRateBasisPoints: 300` (3.00%)
  - `makingGstRateBasisPoints: 500` (5.00%)
  - `stoneGstRateBasisPoints: 300` (3.00%)
  - `goldMakingChargePerGramPaise: 45000` (₹450/g)
  - `silverMakingChargePerGramPaise: 1500` (₹15/g)
  - `caApprovalConfirmed: true` (CA approval confirmed and verified in settings)
  - `quoteLockDurationMinutes: 30` (30 minutes)

#### B. Making Charge Calculation Modes & Weight Basis Confirmation
- **CA-Approved Statutory Rule (Weight Basis)**:
  - **Metal Value**: Computed strictly on **Net Metal Weight** (`netWeightGrams = Math.max(0.01, grossWeight - stoneWeight)`). Bullion rates apply only to actual precious metal.
  - **Making Charges (Job Work)**: Computed on **Gross Weight** (`grossWeight * perGram`). Under Indian jewellery manufacturing standards, casting, polishing, setting, and labour apply to the complete crafted article.
  - **Stone Charges**: Stated separately from metal and making charges.
- **Consistent Pipeline Integration**:
  - `jewellery-pricing.service.ts`, `cart.service.ts`, `order.service.ts`, Razorpay payment intents, and `tax-invoice-pdf.service.ts` all consume `calculateJewelleryPrice()` and use this identical calculation.
  - Supports separate gold (₹450/g) and silver (₹15/g) per-gram defaults or percentage overrides (`metalValuePaise * pct / 100`).
  - Tested in regression test suite (`phase2-autonomous-sprint.test.ts` & `jewellery-tax-cod-plans.test.ts`).

#### C. Stone / Nagina Charges & Resolution of Tax Omission Defect
- **DEFECT RESOLVED**: Stone GST was previously omitted from the total GST sum.
- Fixed in `jewellery-pricing.service.ts`:
  ```typescript
  const stoneGstPaise = Math.round((stoneChargePaise * stoneGstBps) / 10000);
  const rawTotalGstPaise = metalGstPaise + makingGstPaise + stoneGstPaise;
  ```
- All three components (metal GST, making GST, and stone GST) are now accurately summed and verified in automated tests.

#### D. Taxable Value Formula & Single-Line Paise Rounding
- Arithmetic is strictly performed in **integer paise** (zero floating-point math).
- **Consistent Rounding**: Line item subtotal before GST and total GST are summed, and the final price is rounded half-up to the nearest whole rupee:
  ```typescript
  const unroundedTotalPaise = subtotalBeforeGstPaise + totalGstPaise;
  const totalPricePaise = Math.round(unroundedTotalPaise / 100) * 100;
  ```

#### E. Cart, Checkout & Invoice Tax Consistency Discrepancy Resolved
- Previously, `cart.service.ts` hardcoded `taxPaise = 0` and used static `basePricePaise`.
- **RESOLVED**: `cart.service.ts` and `order.service.ts` are now directly connected to `calculateJewelleryQuote()`:
  - Cart line items for gold/silver dynamically compute `unitPricePaise` (subtotal before GST) and `taxPaise` (authoritative GST).
  - Total cart payable formula: `itemsTotalPaise + taxPaise + shippingFeePaise - couponDiscountPaise`.
  - Client-submitted prices, tax amounts, or totals are completely ignored; the server quotation is authoritative.

#### F. The `caApprovalConfirmed` Release Blocker Gate
- **Strict Zod Failsafe**: In `storeSettingsSchema`, the default is strictly set to `false` (`caApprovalConfirmed: z.boolean().default(false)`). A fresh, unconfigured JMD deployment cannot accidentally bypass the approval gate because of missing settings.
- **Explicit Database Check**: `order.service.ts` and `jewellery-pricing.service.ts` strictly evaluate `settingsDoc?.settings?.jewellery?.caApprovalConfirmed === true`. Approval must be explicitly stored in the database document.
- With CA approval confirmed and explicitly stored, `caApprovalConfirmed: true` is verified. Jewellery checkout is operational.
- Safety check remains active: If an administrator toggles `caApprovalConfirmed: false`, checkout for gold and silver items immediately halts with `HTTP 403 (JEWELLERY_TAX_APPROVAL_PENDING)`.

---

## 4. Cash on Delivery (COD) & GST Tax Invoices

### 4.1 Cash on Delivery (COD) Safeguards
- Configurable via `StoreSettings.cod`:
  - `codEnabled: true`
  - `maxOrderAmountPaise: 500000` (₹5,000 max order cap for COD to mitigate courier delivery refusal risk).
- **Payment & Order Status Workflow**:
  - COD orders are created with `status: "PROCESSING"` and `paymentStatus: "PENDING"`.
  - **No premature paid marking**: COD orders CANNOT be marked paid by the client. Only authorized administrators can confirm cash collection via `POST /api/store/orders/[orderRef]/confirm-cod`, updating `paymentStatus: "PAID"`, `codConfirmedAt`, and `codConfirmedBy`, writing an audit record to `AdminAuditLog` (`ORDER_COD_PAYMENT_CONFIRMED`).
  - **Duplicate confirmation idempotency**: Repeated confirmations safely return the confirmed order without re-processing.

### 4.2 GST Tax Invoice PDF Generation & Production Readiness (Phase 2 Update)
- Implemented using `pdf-lib` via `generateStoreTaxInvoicePdf()` in `tax-invoice-pdf.service.ts`.
- Available to authorized customers and administrators via `GET /api/store/orders/[orderRef]/invoice` (protected against unauthorized cross-user downloads with HTTP 403).
- **Concurrency-Safe Sequential Numbering (`StoreInvoiceSequence`)**:
  - Sequential invoice numbers allocated atomically via MongoDB `$inc: { lastSequence: 1 }` on `StoreInvoiceSequence`.
  - Number format conforms to standard GST series: `{prefix}/{financialYear}/{sequence}` (e.g. `JMD/26-27/00001`).
  - Allocated numbers are persisted onto `StoreOrder.invoiceNumber` and reused idempotently on subsequent downloads.
- **Config-Based Production Invoice Gate (`isProductionReady`)**:
  - Managed in `StoreSettings.invoice` with schema validation via Zod:
    - `isProductionReady: boolean` (default: `false`)
    - `legalEntityName`, `tradeName`, `gstin`, `registeredAddress`, `state`, `stateCode`, `invoiceNumberPrefix`, `financialYear`
  - **Failsafe Production Blocking**: When `isProductionReady: true`, invoice generation strictly validates the GSTIN format and blocks staging placeholders (e.g., `07AAAFB1234A1Z5`) or missing seller details by throwing a `DomainError("Official tax invoice issuance is restricted...", 422, "INVOICE_IDENTITY_INCOMPLETE")`.
  - **Staging Draft Generation**: When `isProductionReady: false`, generation produces a valid preview invoice stamped with a prominent watermark banner: `[STAGING DRAFT — NOT FOR OFFICIAL TAX CLAIM — PENDING SELLER REGISTRATION]`.
- **Statutory Conformance & Tax Calculation Preservation**:
  - Line-item breakdown preserves CA-approved rates: Precious Metals (3% GST, HSN 7113), Making Charges (5% GST), and Stones (3% GST).
  - Place of supply determines CGST (50%) + SGST (50%) for intra-state supply (State Code 07 Delhi) vs IGST (100%) for inter-state supply.
  - Tax invoice totals (Subtotal, GST, Shipping, Discounts, Total Payable) reconcile 100% with persisted order totals in integer paise.

---

## 5. Seven Wallets Audit, Bank Withdrawals & Solvency Analysis

| # | Wallet Name | Credit Sources | Debit Uses | Ledger Immutability | Idempotency Key | Withdrawable? |
|---|---|---|---|---|---|---|
| 1 | **Add Money Wallet** | Gateway deposits (`ONLINE_RAZORPAY`), Admin topups | Order checkout, PIN purchases, Plan purchases | `StoreWalletLedger` (Append-Only) | `PAYMENT_INTENT_{id}` | ❌ No (Prepaid Balance) |
| 2 | **Member Activation Wallet** | Activation bonuses, Plan qualification | Upgrade fees, Downline activations | `StoreWalletLedger` (Append-Only) | `ACTIVATION_{userId}_{date}` | ❌ No (Operational Balance) |
| 3 | **Product Points Wallet** | Order purchase point accrual, Promotional plan benefits (₹1,000 / ₹2,000) | Product purchase discounts (1 pt = ₹0.10) | `StoreWalletLedger` (Append-Only) | `ORDER_PTS_{orderRef}` / `PLAN_CREDIT_{planCode}` | ❌ No (Loyalty Credits) |
| 4 | **Free Referral Wallet** | Direct sponsor product purchase commission (Free Tier) | Bank Withdrawal, Store checkout | `StoreWalletLedger` (Append-Only) | `REF_COMM_{orderRef}_{sponsorId}` | ✅ **YES** (Referral Cash) |
| 5 | **Paid Referral Wallet** | Direct sponsor product purchase commission (Area/Chief Tier) | Bank Withdrawal, Store checkout | `StoreWalletLedger` (Append-Only) | `PAID_COMM_{orderRef}_{sponsorId}` | ✅ **YES** (Referral Cash) |
| 6 | **Recharge Wallet** | Telecom recharge margins (40% capped at ₹2 Free, 60% Area, 80% Chief) | Recharge utilities, Store purchases | `StoreWalletLedger` (Append-Only) | `RECHARGE_COMM_{rechargeId}` | ⚠️ Store/Recharge Use Only |
| 7 | **Coupon Valuation Wallet** | Native store coupons, Transferred vouchers, Bhavika external redemptions | Cart coupon discounts (up to 100% order subtotal) | `StoreWalletLedger` (Append-Only) | `COUPON_VAL_{couponCode}` | ❌ No (Discount Instrument) |

### 5.1 Member Bank Withdrawal & Payout Workflow (Remediated in Phase 2)
- **Model**: `StoreWithdrawalRequest` (`src/server/store/models/StoreWithdrawalRequest.ts`).
- **State Lifecycle**: `REQUESTED -> APPROVED -> PROCESSING -> PAID / REJECTED / FAILED`.
- **Withdrawal Eligibility & Rules**:
  - Restricts source balances strictly to verified referral cash earnings (`FREE_REFERRAL` or `PAID_REFERRAL`).
  - Configurable safety limits: Minimum ₹200 (20,000 paise), Maximum ₹50,000 (5,000,000 paise).
  - Validation: 8–20 digit account number, statutory IFSC pattern (`^[A-Z]{4}0[A-Z0-9]{6}$`).
- **Transactional Ledger Hold**:
  - Upon member request submission, wallet balance is immediately debited into a withdrawal hold via `mutateStoreWallet` with `referenceType: "BANK_PAYOUT"`.
  - Prevents double-spending or concurrent over-withdrawal.
- **Rejection & Reversal Safety**:
  - If rejected or marked failed by an admin, the withheld funds are immediately and atomically refunded back to the member's wallet via `mutateStoreWallet` with `referenceType: "ADMIN_CORRECTION"`.
- **Settlement Audit Protection**:
  - Transitions to `PAID` require a non-empty external banking UTR reference (`payoutReference` / `paymentProofUrl`).
  - Admins cannot mark requests `PAID` without entering transaction proof.
  - Automated banking provider dispatch is kept disabled until client selects a payout provider (RazorpayX / Cashfree) and signs commercial terms.
- **Admin Visibility**:
  - Admin Tab #15 ("Withdrawals") at `/admin/store` provides complete oversight, status filtering, and review/reject/settle actions.

### 5.2 Solvency Analysis of Free-Member Recharge Commission & Webhook Resilience
- **Client Request**: Free members earn flat ₹2 on every recharge.
- **Financial Risk**: On standard prepaid mobile recharges (₹10–₹50), aggregator commissions are often 1.0% to 1.5% (i.e., ₹0.10 to ₹0.75). Paying a flat ₹2 on a ₹10 recharge creates an immediate net loss of ₹1.25 to ₹1.90 per transaction for the platform.
- **Implemented Solvency Model**: Free member commission is configured as **40% of aggregator payout, capped at ₹2.00 (200 paise)**. If aggregator pays ₹0.50, member receives ₹0.20 (40%). If aggregator pays ₹6.00 on a postpaid bill, member receives the maximum ₹2.00 cap. This guarantees positive cashflow on every transaction.
- **Webhook Resilience (Phase 2 Update)**:
  - `handleRechargeWebhookCallback()` implemented in `recharge.service.ts` with dedicated endpoint `/api/store/recharge/webhook`.
  - Replay protection: Duplicate callback deliveries with identical operator reference safely short-circuit without double-crediting commissions or re-triggering reversals.
  - Production offline gate: Automatically throws HTTP 503 (`RECHARGE_PROVIDER_NOT_CONFIGURED`) when real aggregator API credentials are unset in production.

---

## 6. Actionable Handover Status (Updated Phase 2 Sprint)

1. **Jewellery GST Model**: CA approval obtained, stone GST defect fixed, separate gold/silver making charges implemented, dynamic quotation linked to cart/orders, checkout unlocked.
2. **Promotional Plans 1 & 2**: Configured in database and admin panel, atomic wallet credit and Super Coupon issuance implemented, customer preview page (`/store/plans`) with governance lock badge built, purchase gated (`isPurchaseActive: false`) pending client valuation signoff.
3. **Free Registration Mini Coupon (B.1)**: Remediated and fully automated. Every new free JMD member receives 1 free MINI coupon with idempotency, retaining statutory lucky draw gating (`isEligibleForDraw: false`).
4. **Member Bank Withdrawal Workflow (B.14)**: Remediated and fully operational internally. Requests, validations, immediate ledger holds, admin review, automated rejection refunds, and UTR settlement built and tested.
5. **Production GST Tax Invoices**: Concurrency-safe atomic sequential numbering (`JMD/26-27/XXXXX`), config-based seller identity, and strict HTTP 422 blocking in production when official GSTIN/address are missing.
6. **Cash on Delivery (COD)**: Configured with ₹5,000 limit, orders tracked as `PENDING`, admin cash collection confirmation implemented.
7. **Recharge Aggregator Resilience**: Config status reporting, production offline gate, and idempotent webhook callback processing built.
8. **Remaining External Dependencies (4 Total)**:
   - Production telecom aggregator API credentials and merchant funding.
   - Formal client signoff on Promotional Plan Super Coupon redemption rules.
   - Legal opinion on Lucky Draw operations under state-specific prize acts.
   - Direct selling compliance confirmation for multi-tier commission limits.

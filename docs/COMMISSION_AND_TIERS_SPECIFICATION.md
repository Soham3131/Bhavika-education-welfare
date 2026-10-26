# Jai Maa Durga — Phase C Membership Tiers & Commission Calculation Specification

## 1. Overview & Regulatory Architecture

This document defines the mathematical, operational, and legal boundaries for Phase C of the **Jai Maa Durga** commerce platform.

Under the **Consumer Protection (Direct Selling) Rules, 2021** and the **Prize Chits and Money Circulation Schemes (Banning) Act, 1978**, lawful direct selling requires that:
1. All commission and referral distributions are derived **exclusively from genuine product sales** to end consumers.
2. **Zero commissions** are paid on enrollment fees, membership subscriptions, head-count recruitment, or PIN purchases.
3. Referral structures are restricted to **direct sponsors only (single-level, depth = 1)** unless formal multi-tier legal clearance is obtained.

---

## 2. Membership Tiers & Qualification Model

### 2.1 Tier Definitions

| Tier | Status | Intended Role | Annual / Monthly Fee | Commission Eligibility | Product Discount |
|---|---|---|---|---|---|
| **FREE** | FINAL | Default tier for all registered members | ₹0 (No fee) | 0% (or consumer recharge cashbacks only) | 0% (Standard catalogue prices) |
| **AREA** | DEV-CONFIRMED | Qualified direct seller | ₹0 (Disabled pending client review) | Admin-configurable % on direct sponsored product sales | Configurable tier discount |
| **CHIEF** | DEV-CONFIRMED | Senior district coordinator / volume seller | ₹0 (Disabled pending client review) | Higher admin-configurable % on direct sponsored product sales | Configurable tier discount |

### 2.2 Qualification Safeguards
- **No Automatic Fees**: Subscription fees and renewal fees are configurable in schema but **default to inactive/disabled**. No member will be charged subscription fees without client and legal authorization.
- **Order-Based Qualification**:
  - `PROPOSED`: Cumulative product purchase threshold (suggested ₹2,000 for Area, ₹10,000 for Chief) promotes members automatically.
  - Every qualification transition creates an immutable row in `StoreMembershipHistory` with `transitionType: "UPGRADE"`, referencing the triggering `orderRef`.
- **Admin Overrides**:
  - Authorized store admins (`STORE_ORDER_MANAGE` or `STORE_FINANCIAL_RECONCILE`) may manually upgrade or downgrade members.
  - Every manual change writes to both `StoreMembershipHistory` and Bhavika's append-only `AdminAuditLog`.

---

## 3. Commission Calculation Base Specification

### 3.1 Base Formula

```
Commission Base = Net Product Revenue (excl. GST and shipping) - Product Cost (if tracked)
```

1. **Exclusions**:
   - **Goods & Services Tax (GST)**: Taxes collected on behalf of the Government of India are strictly excluded. Commission is never paid on tax.
   - **Shipping & Handling**: Courier and fulfillment charges are pass-through logistics costs and strictly excluded.
   - **Applied Discounts**: Native coupons and Bhavika coupon deductions are subtracted proportionally before calculating the commissionable base.
2. **Margin vs. Revenue**:
   - *Recommendation*: Calculate commission as a percentage of **Net Product Amount** (excluding GST and shipping) capped at the product's gross profit margin.
   - *Launch Setting*: Admin-configurable percentage (e.g., 5% for Area, 8% for Chief) applied to eligible line items.

### 3.2 Single-Level Referral Restriction
- Referral commissions are awarded **only to the immediate direct sponsor (`level = 1`)**.
- If a member has no sponsor (`sponsorId === null`), zero commission is created.
- The commission engine strictly forbids recursive tree traversal.

### 3.3 Lifecycle & Event Triggering

| Order Event | Commission Action | Ledger Status | Rationale |
|---|---|---|---|
| **Payment Captured (`PAID`)** | Create ledger entry with idempotency key `comm:${orderRef}:${sourceMemberId}:${sponsorId}` | `PENDING` | Payment received, but return window is active. |
| **Order Delivered (`DELIVERED`) + Return Period** | Settle commission to sponsor store wallet | `PAID` | Sale is final and irrevocable. |
| **Order Cancelled (`CANCELLED`)** | Cancel pending commission entry | `CANCELLED` | Order never shipped; no commission due. |
| **Order Refunded (`REFUNDED`)** | Append compensating reversal ledger entry (`type: "SALE_REVERSAL"`) | `REVERSED` | History is preserved; reversal offsets sponsor ledger balance. |

---

## 4. Financial Safety & Idempotency Rules

1. **Immutable Ledger**: Entries in `StoreCommissionLedger` are append-only. Historical records are never updated or deleted. Reversals are recorded as new compensating transactions.
2. **Idempotency**: Keyed on `comm:${orderRef}:${sourceMemberId}:${sponsorId}`. Repeated payment webhooks or duplicate delivery events return the existing entry without duplicate credits.
3. **Global Payout Gate**:
   - `commissionPayoutsEnabled` setting defaults to `false`.
   - In disabled mode, commissions are computed and recorded for auditing (`AUDIT_ONLY`), but zero money is disbursed to wallets until legal review is complete.

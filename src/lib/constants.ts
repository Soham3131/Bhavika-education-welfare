/** Static, non-secret app constants. Safe to import anywhere (client or server). */

export const SITE = {
  name: "Bhavika Education & Welfare Foundation",
  shortName: "Bhavika Foundation",
  nameHi: "भाविका एजुकेशन एंड वेलफेयर फाउंडेशन",
  tagline: "Learn • Compete • Earn",
  taglineHi: "सीखो • जीतो • कमाओ",
  description:
    "Bhavika Education & Welfare Foundation turns everyday learning into daily quizzes, points and real rewards for children in small towns and villages. Play, climb the leaderboard, and earn discounts your family can actually use.",
  /**
   * The canonical public address of the site.
   *
   * Distinct from `env.SITE_URL`, which is whatever host the app is currently
   * running on (localhost in development). Anything a user is expected to
   * SHARE — a referral link above all — must use this, never the running host,
   * or a developer's machine hands out `http://localhost:3000/register?ref=…`.
   */
  url: "https://bhavika-education-welfare.vercel.app",
  locale: "en_IN",
  timezone: "Asia/Kolkata",
  contact: {
    email: "avanienterprises.contact@gmail.com",
    phone: "+91 00000 00000",
    whatsapp: "910000000000",
    address: "India",
  },
  social: {
    facebook: "",
    instagram: "",
    youtube: "",
    twitter: "",
  },
} as const;

/**
 * Canonical registration URL for Bhavika Education & Welfare Foundation.
 * Configurable via NEXT_PUBLIC_BHAVIKA_REGISTER_URL; defaults to Bhavika's /register route.
 */
export const BHAVIKA_REGISTER_URL =
  process.env.NEXT_PUBLIC_BHAVIKA_REGISTER_URL ||
  `${process.env.NEXT_PUBLIC_SITE_URL || SITE.url}/register`;

/**
 * Primary public navigation. Ordered so the engagement platform (Quiz,
 * Rewards, Leaderboard) sits mid-bar rather than buried — it is the reason
 * most visitors register. Secondary pages (Mission & Vision, Videos,
 * Testimonials, Partners) are reachable from the footer and the About page.
 */
export const PUBLIC_NAV = [
  { label: "Home", hi: "होम", href: "/" },
  { label: "About", hi: "हमारे बारे में", href: "/about" },
  { label: "Programs", hi: "कार्यक्रम", href: "/programs" },
  { label: "Quiz", hi: "क्विज़", href: "/quiz" },
  { label: "Rewards", hi: "इनाम", href: "/rewards" },
  { label: "Leaderboard", hi: "लीडरबोर्ड", href: "/leaderboard" },
  { label: "Gallery", hi: "गैलरी", href: "/gallery" },
  { label: "Contact", hi: "संपर्क", href: "/contact" },
] as const;

/** Secondary pages — footer only. */
export const FOOTER_NAV = [
  { label: "Mission & Vision", hi: "लक्ष्य और दृष्टि", href: "/mission-vision" },
  { label: "Videos", hi: "वीडियो", href: "/videos" },
  { label: "Testimonials", hi: "लोगों की राय", href: "/testimonials" },
  { label: "Partners", hi: "सहयोगी", href: "/partners" },
] as const;

export const USER_NAV = [
  { label: "Overview", href: "/dashboard" },
  { label: "Quizzes", href: "/dashboard/quizzes" },
  { label: "Wallet", href: "/dashboard/wallet" },
  { label: "Referrals", href: "/dashboard/referrals" },
  { label: "Leaderboard", href: "/dashboard/leaderboard" },
  { label: "Rewards", href: "/dashboard/benefits" },
  { label: "Donations", href: "/dashboard/donations" },
  { label: "ID Card", href: "/dashboard/id-card" },
  { label: "Profile", href: "/dashboard/profile" },
] as const;

export const ADMIN_NAV = [
  { label: "Dashboard", href: "/admin" },
  { label: "Content", href: "/admin/content" },
  { label: "Gallery", href: "/admin/gallery" },
  { label: "Videos", href: "/admin/videos" },
  { label: "Testimonials", href: "/admin/testimonials" },
  { label: "Partners", href: "/admin/partners" },
  { label: "Quizzes", href: "/admin/quizzes" },
  { label: "Users", href: "/admin/users" },
  { label: "ID Cards", href: "/admin/id-cards" },
  { label: "Donations", href: "/admin/donations" },
  { label: "Wallet", href: "/admin/wallet" },
  // Sits beside Wallet: an issued coupon is points that have already left a
  // wallet, so the two pages are read together when money is being reconciled.
  { label: "Coupons", href: "/admin/coupons" },
  { label: "Referrals", href: "/admin/referrals" },
  { label: "Contacts", href: "/admin/contacts" },
  { label: "Security", href: "/admin/security" },
  { label: "Settings", href: "/admin/settings" },
] as const;

/** Default business rules — persisted (and overridable) via SystemSettings collection. */
export const DEFAULT_SETTINGS = {
  referral: {
    /** Points awarded to the referrer when a referral qualifies. */
    referrerReward: 50,
    /** Points awarded to the referred user on qualification. */
    referredReward: 0,
    /** Rule: what makes a referral QUALIFIED. */
    requireEmailVerification: true,
    requireFirstQuiz: true,
  },
  quiz: {
    /** Default seconds per quiz if a quiz does not set its own limit. */
    defaultTimeLimitSeconds: 300,
    /** Default max attempts per quiz period. */
    defaultMaxAttempts: 1,
    /** Default points per correct answer. */
    defaultPointsPerCorrect: 10,
  },
  activity: {
    profileCompletionPoints: 20,
  },
  integration: {
    /** Phase 2 redemption disabled until Jai Maa Durga is live. */
    redemptionEnabled: false,
    /**
     * Points a member must hold before they can redeem anything. Matches the
     * "At 5,000 points…" promise made on the public Rewards page — the two must
     * move together or the site advertises a threshold it does not enforce.
     */
    minRedeemPoints: 5000,
    /**
     * Conversion rate: how many points buy one rupee of coupon value.
     * At 10, the 5,000-point threshold is worth exactly the "₹500 off at Jai
     * Maa Durga" figure shown on the homepage.
     */
    pointsPerRupee: 10,
    /**
     * Redemptions must land on a whole multiple of this many points, so a
     * coupon is always a round rupee amount rather than ₹37.40.
     */
    redeemStepPoints: 500,
    /**
     * How long an issued coupon stays usable. Points are debited the moment the
     * coupon is created and are NOT returned if it lapses unused, so this number
     * is the length of the window a family has to actually spend what they
     * earned — it must be stated to them before they generate anything.
     */
    couponValidityDays: 90,
  },
} as const;

export const RATE_LIMITS = {
  contact: { limit: 3, windowSeconds: 600 }, // 3 submissions / 10 min / IP
  login: { limit: 8, windowSeconds: 300 },
  register: { limit: 5, windowSeconds: 600 },
  forgotPassword: { limit: 4, windowSeconds: 900 },
  quizStart: { limit: 20, windowSeconds: 300 },
  quizSubmit: { limit: 30, windowSeconds: 300 },
} as const;

export const UPLOAD = {
  maxImageBytes: 5 * 1024 * 1024, // 5 MB
  allowedImageTypes: ["image/jpeg", "image/png", "image/webp", "image/avif"],
} as const;

export const REFERRAL_CODE_LENGTH = 8;

/**
 * Coupon code shape — e.g. `BHAV-7K2X-9QM4-P8RT`.
 *
 * Read aloud down a phone line to a shopkeeper and copied off a printout, so it
 * uses the same unambiguous alphabet as referral codes (no O/0/I/1 — all four
 * confusable glyphs are absent, which is why no character substitution is
 * needed when normalising typed input) and is dashed into groups of four.
 *
 * Three groups, not two: a coupon is money, the partner store's validation
 * endpoint does not exist yet so we cannot lean on its rate limiting, and 12
 * characters over a 32-symbol alphabet is ~1.15e18 codes — unguessable — while
 * still short enough to dictate.
 */
export const COUPON_CODE = {
  prefix: "BHAV",
  alphabet: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789",
  groupLength: 4,
  groups: 3,
} as const;

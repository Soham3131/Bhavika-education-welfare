import type { Metadata, Viewport } from "next";
import { Poppins, Noto_Sans_Devanagari, Playfair_Display } from "next/font/google";
import { Toaster } from "sonner";
import { SITE } from "@/lib/constants";
import "./globals.css";

// Latin typeface. Only the four weights the design system uses are loaded
// (400 body, 500 labels/nav, 600 buttons/titles, 700 hero). `swap` +
// next/font's automatic size-adjust fallback keeps font loading CLS-safe.
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Devanagari companion. The site is bilingual on every public surface, so
// Hindi needs a real paired face rather than a system fallback.
const notoDevanagari = Noto_Sans_Devanagari({
  variable: "--font-noto-devanagari",
  subsets: ["devanagari"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

// Editorial serif typeface for Jai Maa Durga luxury headings.
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || SITE.url;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: `${SITE.name} — ${SITE.tagline}`,
    template: `%s | ${SITE.shortName}`,
  },
  description: SITE.description,
  applicationName: SITE.shortName,
  keywords: [
    "NGO",
    "education",
    "welfare",
    "foundation",
    "Bhavika",
    "community",
    "charity",
    "India",
  ],
  authors: [{ name: SITE.name }],
  openGraph: {
    type: "website",
    locale: SITE.locale,
    url: siteUrl,
    siteName: SITE.name,
    title: `${SITE.name} — ${SITE.tagline}`,
    description: SITE.description,
    images: [{ url: "/logo-lockup.png", width: 1000, height: 1000, alt: SITE.name }],
  },
  twitter: {
    card: "summary",
    title: SITE.name,
    description: SITE.description,
    images: ["/logo-lockup.png"],
  },
  icons: { icon: "/logo-mark.png", apple: "/logo-mark.png" },
  alternates: { canonical: siteUrl },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: "#f95c1b",
  width: "device-width",
  initialScale: 1,
  colorScheme: "light",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${poppins.variable} ${notoDevanagari.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background">
        {children}
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}

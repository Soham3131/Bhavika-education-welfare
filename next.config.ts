import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(self)",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "img.youtube.com" },
      { protocol: "https", hostname: "i.ytimg.com" },
      // Curated seed photography — see src/lib/images.ts.
      { protocol: "https", hostname: "images.unsplash.com" },
      // Earlier seeds pointed at picsum; kept so existing rows still render.
      { protocol: "https", hostname: "picsum.photos" },
    ],
  },
  // Keep the Mongoose/bcrypt native-ish deps external to the server bundle.
  serverExternalPackages: ["mongoose", "bcryptjs"],
  experimental: {
    cpus: process.env.BUILD_CPUS ? Number(process.env.BUILD_CPUS) : undefined,
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

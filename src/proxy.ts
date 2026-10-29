import NextAuth from "next-auth";
import { NextResponse } from "next/server";
import { authConfig } from "@/server/auth/config";
import { UserRole } from "@/lib/enums";

// Edge-safe auth instance (no DB/Credentials providers here).
const { auth } = NextAuth(authConfig);

export type ProxyRequest = {
  nextUrl: URL;
  auth?: {
    user?: {
      id?: string;
      role?: UserRole;
    };
  } | null;
};

export function handleProxyRoute(req: ProxyRequest) {
  const { nextUrl } = req;
  const token = req.auth;
  const isLoggedIn = Boolean(token?.user?.id);
  const isAdmin = token?.user?.role === UserRole.ADMIN;

  const path = nextUrl.pathname;

  // Project-specific storefront routing:
  // When JMD_SITE_MODE="true" (Jai Maa Durga deployment):
  //   Requests to "/" render the existing JMD storefront from "/store".
  // When JMD_SITE_MODE is not set or false (Bhavika Foundation deployment):
  //   Requests to "/" render the standard Bhavika homepage.
  // Never rewrites /api, authentication callbacks, static assets, or store API routes.
  if (process.env.JMD_SITE_MODE === "true" && path === "/") {
    const url = new URL("/store", nextUrl);
    return NextResponse.rewrite(url);
  }

  const isDashboard = path.startsWith("/dashboard");
  // Guard the admin portal only — not sibling routes like /admin-login.
  const isAdminArea = path === "/admin" || path.startsWith("/admin/");

  // Admin area: must be logged in AND admin.
  if (isAdminArea) {
    if (!isLoggedIn) return redirectToLogin(nextUrl);
    if (!isAdmin) return NextResponse.redirect(new URL("/dashboard", nextUrl));
    return NextResponse.next();
  }

  // User dashboard: must be logged in.
  if (isDashboard && !isLoggedIn) {
    return redirectToLogin(nextUrl);
  }

  // Logged-in users shouldn't see auth pages.
  if (isLoggedIn && (path === "/login" || path === "/register")) {
    return NextResponse.redirect(new URL(isAdmin ? "/admin" : "/dashboard", nextUrl));
  }

  return NextResponse.next();
}

export default auth(handleProxyRoute);

function redirectToLogin(nextUrl: URL) {
  const url = new URL("/login", nextUrl);
  url.searchParams.set("callbackUrl", nextUrl.pathname + nextUrl.search);
  return NextResponse.redirect(url);
}

export const config = {
  // Run on app routes, excluding static assets and Next internals.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|logo.png|.*\\.(?:png|jpg|jpeg|svg|webp|ico)$).*)"],
};

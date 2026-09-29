import { NextResponse, type NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { requireAuthSecret } from "@/lib/env";

// Lightweight edge gate: cookie presence only for the general auth gate below
// (full auth + RBAC enforced in server layouts/actions via requireUser(), so
// this never needs Prisma/bcrypt in edge). The one exception is the
// support-tier admin check further down: getToken() is next-auth's own
// Edge-safe JWT decode (verifies + reads the signed cookie directly, no DB
// call, no Prisma adapter) — it's the intended tool for exactly this case.
//
// Marketing + auth pages are public; only the app's own route prefixes are gated.
//
// (Next 16 renamed the `middleware` file convention to `proxy` — same behaviour.
// A stray src/middleware.ts here is NEVER loaded by Next 16; don't recreate one.)

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/ideas",
  "/studio",
  "/templates",
  "/composer",
  "/calendar",
  "/queue",
  "/inbox",
  "/comments",
  "/analytics",
  "/campaigns",
  "/reports",
  "/insights",
  "/trends",
  "/competitors",
  "/opportunities",
  "/media",
  "/automations",
  "/recycling",
  "/team",
  "/approvals",
  "/integrations",
  "/settings",
  "/agency",
  "/admin",
  "/onboarding",
];

const AUTH_PREFIXES = [
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/verify",
];

function hasSession(req: NextRequest): boolean {
  return (
    req.cookies.has("authjs.session-token") ||
    req.cookies.has("__Secure-authjs.session-token")
  );
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const rawHost = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const host = rawHost.split(":")[0].toLowerCase();
  const authed = hasSession(req);

  // Admin tiering: a platformRole:"support" admin may only reach
  // /admin/support — everywhere else under /admin/* bounces them there before
  // any admin layout or page runs, so those pages needed zero individual
  // changes. Full admins (platformRole: null, the default) are unaffected.
  if (authed && (pathname === "/admin" || pathname.startsWith("/admin/")) && !pathname.startsWith("/admin/support")) {
    const token = await getToken({ req, secret: requireAuthSecret() }).catch(() => null);
    if (token?.platformRole === "support") {
      return NextResponse.redirect(new URL("/admin/support", req.url));
    }
  }

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );
  const isAuthRoute = AUTH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  const isAppHost = host === "app.multipoststudio.online";
  const isMainHost = host === "multipoststudio.online" || host === "www.multipoststudio.online";

  // If request hits marketing domain (multipoststudio.online or www.multipoststudio.online)
  if (isMainHost) {
    if (isProtected || isAuthRoute) {
      const destUrl = new URL(pathname + search, "https://app.multipoststudio.online");
      return NextResponse.redirect(destUrl);
    }
    return NextResponse.next();
  }

  // If request hits app subdomain (app.multipoststudio.online)
  if (isAppHost) {
    if (pathname === "/") {
      const dest = authed ? "/dashboard" : "/login";
      return NextResponse.redirect(new URL(dest, req.url));
    }

    if (!authed && isProtected) {
      const url = new URL("/login", req.url);
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }

    return NextResponse.next();
  }

  // Fallback for local dev (localhost) or preview environments (*.vercel.app)
  if (!authed && isProtected) {
    const url = new URL("/login", req.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

import { NextResponse, type NextRequest } from "next/server";

// Lightweight edge gate: cookie presence only. Full auth + RBAC enforced in
// server layouts/actions via requireUser(). Keeps Prisma/bcrypt out of edge.
//
// Marketing + auth pages are public; only the app's own route prefixes are gated.
//
// (Next 16 renamed the `middleware` file convention to `proxy` — same behaviour.)

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
  "/referrals",
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

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const rawHost = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  const host = rawHost.split(":")[0].toLowerCase();
  const authed = hasSession(req);

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

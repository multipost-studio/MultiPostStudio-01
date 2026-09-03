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

function hasSession(req: NextRequest): boolean {
  return (
    req.cookies.has("authjs.session-token") ||
    req.cookies.has("__Secure-authjs.session-token")
  );
}

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const authed = hasSession(req);

  // NOTE: do NOT redirect cookie-holders away from /login etc. here. A stale or
  // invalid session cookie would then ping-pong /login <-> /dashboard forever
  // (dashboard's requireWorkspace redirects back to /login). The "already
  // signed in -> dashboard" hop is done in (auth)/layout.tsx with a real
  // session lookup, so an unresolvable cookie just renders the login form.

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

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

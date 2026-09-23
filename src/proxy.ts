import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_COOKIE_NAME } from "@/lib/security/admin";

// Optimistic only, per Next's own guidance: a quick redirect for a better UX, not the real
// authorization decision. Every /admin page and /api/admin route re-verifies the cookie's HMAC
// signature and expiry itself (isAdminSession) - that is the authoritative check.
export function proxy(request: NextRequest) {
  if (!request.cookies.get(ADMIN_COOKIE_NAME)?.value) {
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/admin/((?!login).*)",
};

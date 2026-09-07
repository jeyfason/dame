import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isProtected = createRouteMatcher(["/play(.*)", "/profile(.*)"]);

// Playwright-only bypass for GET /play in local dev/test without Clerk keys.
// Active solely when E2E_BYPASS_AUTH=1 and NODE_ENV!=="production".
const isE2EBypass =
  process.env.E2E_BYPASS_AUTH === "1" && process.env.NODE_ENV !== "production";

const middleware = isE2EBypass
  ? () => NextResponse.next()
  : clerkMiddleware(async (auth, req) => {
      if (isProtected(req)) await auth.protect();
    });

export default middleware;

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};

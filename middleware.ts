import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isProtected = createRouteMatcher(["/play(.*)", "/profile(.*)"]);

// Local Playwright E2E bypass (dev/test only, never set in production):
// skip Clerk entirely so /play renders without Clerk keys.
const middleware =
  process.env.E2E_BYPASS_AUTH === "1"
    ? () => {}
    : clerkMiddleware(async (auth, req) => {
        if (isProtected(req)) await auth.protect();
      });

export default middleware;

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};

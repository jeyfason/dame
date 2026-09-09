import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  /* config options here */
};

export default withSentryConfig(nextConfig, {
  silent: true,
  // Source maps: withSentryConfig uploads sourcemaps on `next build` when
  // SENTRY_ORG/PROJECT/AUTH_TOKEN are set; hidden by default so no
  // source leaks to browsers. Set SENTRY_RELEASE=git-SHA in CI to tag.
});

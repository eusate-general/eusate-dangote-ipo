import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  /* config options here */
};

// Safe with no Sentry account: without SENTRY_AUTH_TOKEN the plugin skips source-map upload
// (a log line, not an error) and the build proceeds normally.
const configWithSentry = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: !process.env.CI,
});

export default configWithSentry;

import type { NextConfig } from "next";

import { devOnlyEnvError } from "./lib/dev-only-env.ts";

// A deployment must not carry the local login shortcut's variables. The rule
// itself lives in lib/dev-only-env.ts so it can be tested; see the comment
// there for why their absence is enforced rather than assumed.
const devOnlyError = devOnlyEnvError(process.env);

if (devOnlyError) {
  throw new Error(devOnlyError);
}

const nextConfig: NextConfig = {
  // The PDF routes read their embedded fonts from disk (lib/pdf/kit.tsx). A
  // path built at run time is invisible to output tracing, so without this a
  // deployed function would have no fonts and every download would fail.
  outputFileTracingIncludes: {
    "/api/google-ads/pdf": ["./lib/pdf/fonts/*.ttf"],
    "/api/agencies/[slug]/overview/pdf": ["./lib/pdf/fonts/*.ttf"],
  },
};

export default nextConfig;

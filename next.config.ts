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
  /* config options here */
};

export default nextConfig;

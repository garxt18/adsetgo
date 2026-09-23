/**
 * Environment variables that configure the local login shortcut in
 * `app/login/page.tsx` and must never accompany a deployment.
 *
 * Their `NEXT_PUBLIC_` half is readable by the browser. Today they survive a
 * production build only because the bundler drops the branch guarded by
 * `NODE_ENV !== "production"`, which is an optimisation rather than a
 * guarantee, so their presence is refused outright at build time.
 */
export const DEV_ONLY_VARS = [
  "DEV_ADMIN_EMAIL",
  "DEV_ADMIN_PASSWORD",
  "NEXT_PUBLIC_DEV_ADMIN_EMAIL",
  "NEXT_PUBLIC_DEV_ADMIN_PASSWORD",
] as const;

/** True for a build that produces a deployable artifact rather than a local one. */
export function isDeploymentBuild(env: Record<string, string | undefined>): boolean {
  return Boolean(env.VERCEL || env.CI);
}

/** The dev-only variables present in `env`, ignoring ones set to blank. */
export function findDevOnlyVars(
  env: Record<string, string | undefined>
): string[] {
  return DEV_ONLY_VARS.filter((name) => env[name]?.trim());
}

/**
 * Returns the error message for a deployment carrying dev-only variables, or
 * null when the environment is acceptable.
 */
export function devOnlyEnvError(
  env: Record<string, string | undefined>
): string | null {
  if (!isDeploymentBuild(env)) {
    return null;
  }

  const present = findDevOnlyVars(env);

  if (present.length === 0) {
    return null;
  }

  return (
    `Refusing to build: ${present.join(", ")} must not be set in a deployed ` +
    `environment. These configure the local login shortcut and are never used ` +
    `outside development. Remove them from the deployment's environment ` +
    `variables and build again.`
  );
}

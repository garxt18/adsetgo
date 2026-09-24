import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseConfig } from "@/lib/supabase/env";

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  const response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  });

  // The dev override is a local convenience only. Reading it in production would
  // let anyone bypass authentication by setting a single cookie, so it is gated
  // to non-production builds and treated as absent everywhere else.
  const isDevEnvironment = process.env.NODE_ENV !== "production";
  const devAdminOverride = isDevEnvironment
    ? request.cookies.get("dev_admin_override")?.value
    : undefined;

  if (devAdminOverride) {
    return response;
  }

  const { url, key } = getSupabaseConfig("public");

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  const isAuthenticated = !error && !!user;

  function safeRedirect(targetPath: string) {
    const url = new URL(targetPath, request.url);
    if (url.hostname === "0.0.0.0") {
      url.hostname = "localhost";
    }
    return NextResponse.redirect(url);
  }

  // 1. Master dashboard & new agency routes
  if (
    pathname === "/dashboard" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/agencies/new" ||
    pathname.startsWith("/agencies/new/")
  ) {
    if (!isAuthenticated && !devAdminOverride) {
      return safeRedirect("/login");
    }
    return response;
  }

  // 2. Multi-tenant agency protected routes
  // Match /agencies/:slug/dashboard, /agencies/:slug/client-dashboard, /agencies/:slug/clients/:id, etc.
  // Ensure "new" is not treated as a tenant slug
  const agencyMatch = pathname.match(/^\/agencies\/([^/]+)(\/.*)?$/);
  if (agencyMatch && agencyMatch[1] !== "new") {
    const slug = agencyMatch[1];
    const subpath = agencyMatch[2] || "";

    // Public agency routes
    // Accounts are created by invitation, so the only pages a signed-out
    // visitor needs are the two sign-in screens.
    const isPublicAgencyRoute =
      subpath === "/login" || subpath === "/client-login";

    if (!isPublicAgencyRoute && !isAuthenticated && !devAdminOverride) {
      if (subpath === "/client-dashboard") {
        return safeRedirect(`/agencies/${slug}/client-login`);
      }
      return safeRedirect(`/agencies/${slug}/login`);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/agencies/:path*",
  ],
};

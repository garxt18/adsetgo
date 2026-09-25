import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getSupabaseConfig } from "@/lib/supabase/env";

/**
 * Sends signed-out visitors to the right sign-in screen. It decides nothing
 * about what a signed-in person may see: every page's data comes from an API
 * route that authorises itself, and this matcher never covers /api/*.
 */
export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });

  // The dev override is a local convenience only. Reading it in production would
  // let anyone bypass authentication by setting a single cookie, so it is gated
  // to non-production builds and treated as absent everywhere else.
  if (
    process.env.NODE_ENV !== "production" &&
    request.cookies.get("dev_admin_override")?.value
  ) {
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

  // getClaims verifies the session's signature here, against keys cached for
  // ten minutes, instead of asking Supabase on every page load as getUser did.
  const { data } = await supabase.auth.getClaims();

  if (data?.claims) {
    return response;
  }

  const pathname = request.nextUrl.pathname;
  const agency = pathname.match(/^\/agencies\/([^/]+)(\/.*)?$/);

  // Everything under /dashboard and /agencies/new belongs to the platform admin.
  if (!agency || agency[1] === "new") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const [, slug, subpath = ""] = agency;

  // Accounts are created by invitation, so the only pages a signed-out visitor
  // needs are the two sign-in screens.
  if (subpath === "/login" || subpath === "/client-login") {
    return response;
  }

  return NextResponse.redirect(
    new URL(
      subpath === "/client-dashboard"
        ? `/agencies/${slug}/client-login`
        : `/agencies/${slug}/login`,
      request.url
    )
  );
}

export const config = {
  matcher: ["/dashboard/:path*", "/agencies/:path*"],
};

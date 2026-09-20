import { NextResponse } from "next/server";

export async function GET() {
  // Clear the dev_admin_override cookie by setting it expired.
  // Note: domain attribute is intentionally omitted because localhost ignores it.
  const res = NextResponse.json({ success: true, cleared: "dev_admin_override" });
  res.headers.set(
    "Set-Cookie",
    "dev_admin_override=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax"
  );
  return res;
}

import { getGoogleAdsAccessToken } from "./lib/google-ads/auth.ts";
import { supabaseAdmin } from "./lib/supabase-admin.ts";

async function main() {
  try {
    const { data: agency } = await supabaseAdmin
      .from("agencies")
      .select("*")
      .eq("slug", "ram")
      .maybeSingle();

    console.log("Agency Ram:", agency?.name, "Manager ID:", agency?.google_ads_manager_customer_id);

    const accessToken = await getGoogleAdsAccessToken({ agencyId: agency?.id });
    console.log("Access token obtained successfully.");

    const devToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || "";
    const managerId = "7626717511";
    const v = "v25";
    console.log(`\n--- Testing ${v} /customers/${managerId}/googleAds:searchStream ---`);
    const hierRes = await fetch(
      `https://googleads.googleapis.com/${v}/customers/${managerId}/googleAds:searchStream`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "developer-token": devToken || "",
          "login-customer-id": managerId,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: `
            SELECT
              customer_client.client_customer,
              customer_client.id,
              customer_client.descriptive_name,
              customer_client.status,
              customer_client.hidden,
              customer_client.manager,
              customer_client.test_account,
              customer_client.currency_code,
              customer_client.time_zone,
              customer_client.level
            FROM customer_client
          `,
        }),
      }
    );
    console.log(`Version ${v} searchStream status:`, hierRes.status);
    console.log(await hierRes.text());
  } catch (err) {
    console.error("Test failed:", err);
  }
}

main();

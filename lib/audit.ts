import { supabaseAdmin } from "./supabase/admin.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Record a sensitive action in `audit_logs`.
 *
 * Never throws: failing to write the log must not undo or block the action it
 * describes. The actor is only stored when it is a real account id -- the local
 * development shortcut signs in as "dev-admin", which is not one.
 */
export async function recordAudit({
  agencyId,
  clientId,
  actorId,
  action,
  resourceType,
}: {
  agencyId: string;
  clientId?: string;
  actorId: string;
  action: string;
  resourceType: string;
}) {
  try {
    await supabaseAdmin.from("audit_logs").insert({
      agency_id: agencyId,
      client_id: clientId ?? null,
      user_id: UUID.test(actorId) ? actorId : null,
      action,
      resource_type: resourceType,
    });
  } catch (error) {
    console.error("Could not write audit log entry:", error);
  }
}

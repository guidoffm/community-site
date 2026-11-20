import { sql } from "drizzle-orm";
import { db } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await db().execute(sql`select 1`);
    return Response.json({ status: "ok" });
  } catch (e) {
    return Response.json({ status: "error", error: e instanceof Error ? e.message : String(e) }, { status: 503 });
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { getRole } from "@/lib/session";
import { queryAsRole } from "@/lib/db";
import { serviceClient, STORAGE_BUCKET } from "@/lib/supabase";

/**
 * Download endpoint. The access decision happens here, not in the UI:
 *
 * 1. Look the document up AS the viewer's role. Row Level Security means a
 *    client-role request cannot even read a private document's row — so it can
 *    never learn the storage path, let alone the bytes.
 * 2. Only if that read succeeds do we mint a short-lived signed URL and redirect.
 *
 * Result: pasting a private document's download URL while in Client view returns
 * 403, because the private row is invisible to that role.
 */
export async function GET(
  _req: NextRequest,
  ctx: RouteContext<"/api/download/[docId]">,
) {
  const { docId } = await ctx.params;
  const role = await getRole();

  let doc: { storage_path: string; name: string } | undefined;
  try {
    const rows = await queryAsRole<{ storage_path: string; name: string }>(
      role,
      "select storage_path, name from documents where id = $1",
      [docId],
    );
    doc = rows[0];
  } catch (err) {
    console.error("Download lookup failed:", err);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }

  if (!doc) {
    // Either the document does not exist, or RLS hid it from this role.
    return NextResponse.json(
      {
        error: "Not accessible",
        detail:
          "This document is not available to your current view. Private-space documents are only accessible to the delivery team.",
      },
      { status: 403 },
    );
  }

  const signed = await serviceClient()
    .storage.from(STORAGE_BUCKET)
    .createSignedUrl(doc.storage_path, 60, { download: doc.name });

  if (signed.error || !signed.data) {
    console.error("Signed URL creation failed:", signed.error?.message);
    return NextResponse.json(
      { error: "Could not create download link" },
      { status: 500 },
    );
  }

  return NextResponse.redirect(signed.data.signedUrl);
}

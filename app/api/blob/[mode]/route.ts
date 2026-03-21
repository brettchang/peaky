import { get } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";

const BLOB_HOST_SUFFIX = ".blob.vercel-storage.com";

function isValidBlobUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      parsed.hostname.endsWith(BLOB_HOST_SUFFIX)
    );
  } catch {
    return false;
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { mode: string } }
) {
  const mode = params.mode;
  if (mode !== "view" && mode !== "download") {
    return NextResponse.json({ error: "Invalid mode" }, { status: 404 });
  }

  const blobUrl = req.nextUrl.searchParams.get("url");
  if (!blobUrl || !isValidBlobUrl(blobUrl)) {
    return NextResponse.json({ error: "Invalid blob URL" }, { status: 400 });
  }

  try {
    const result = await get(blobUrl, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) {
      return NextResponse.json({ error: "Unable to access blob" }, { status: 404 });
    }

    const filename = result.blob.pathname.split("/").pop() || "file";
    const disposition =
      mode === "download"
        ? `attachment; filename="${filename}"`
        : `inline; filename="${filename}"`;

    return new Response(result.stream, {
      status: 200,
      headers: {
        "Content-Type": result.blob.contentType || "application/octet-stream",
        "Content-Disposition": disposition,
        "Cache-Control": "no-store",
      },
    });
  } catch (err: unknown) {
    console.error(`Blob ${mode} error:`, err);
    return NextResponse.json({ error: "Unable to access blob" }, { status: 404 });
  }
}

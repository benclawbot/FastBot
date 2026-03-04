import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Fetch media from gateway
    const port = await getGatewayPort();
    const response = await fetch(`http://127.0.0.1:${port}/media/${id}`);

    if (!response.ok) {
      return new NextResponse("File not found", { status: 404 });
    }

    const data = await response.arrayBuffer();

    // Determine content type from filename extension
    const ext = id.split(".").pop()?.toLowerCase() || "";
    const mimeTypes: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      pdf: "application/pdf",
      txt: "text/plain",
      md: "text/markdown",
      csv: "text/csv",
      json: "application/json",
    };

    const contentType = mimeTypes[ext] || "application/octet-stream";

    return new NextResponse(data, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    console.error("Media fetch error:", error);
    return new NextResponse("Internal error", { status: 500 });
  }
}

async function getGatewayPort(): Promise<number> {
  // Try to get port from .gateway-port file
  try {
    const response = await fetch("http://127.0.0.1:3100/.gateway-port");
    if (response.ok) {
      const data = await response.json();
      return data.port;
    }
  } catch {
    // Fall through
  }
  return 18789;
}

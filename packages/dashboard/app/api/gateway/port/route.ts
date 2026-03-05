import { NextResponse } from "next/server";

const DEFAULT_GATEWAY_PORT = 44512;

export async function GET() {
  return NextResponse.json({ port: DEFAULT_GATEWAY_PORT, host: "127.0.0.1" });
}

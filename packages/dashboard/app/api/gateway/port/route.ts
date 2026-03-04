import { NextRequest, NextResponse } from "next/server";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export async function GET() {
  // Try to read from the gateway-port file in the project root
  const possiblePaths = [
    resolve(process.cwd(), ".gateway-port"),
    resolve(process.cwd(), "..", "..", ".gateway-port"),
    resolve(process.cwd(), "..", ".gateway-port"),
  ];

  for (const filePath of possiblePaths) {
    if (existsSync(filePath)) {
      try {
        const port = readFileSync(filePath, "utf-8").trim();
        return NextResponse.json({ port: parseInt(port, 10), host: "127.0.0.1" });
      } catch {
        // Continue to next path
      }
    }
  }

  // Fallback - try common gateway ports
  return NextResponse.json({ port: 18789, host: "127.0.0.1" });
}

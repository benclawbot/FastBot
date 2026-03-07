import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";

interface JwtPayload {
  sub: string;
  iss: string;
  iat: number;
  exp: number;
  origin: "web" | "telegram";
}

function base64url(data: string | Buffer): string {
  const b = typeof data === "string" ? Buffer.from(data) : data;
  return b.toString("base64url");
}

function verifyToken(token: string, secret: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;

    const header = JSON.parse(Buffer.from(headerB64, "base64url").toString("utf-8"));
    if (header.alg !== "HS256") return null;

    const unsigned = `${headerB64}.${payloadB64}`;
    const expectedSig = createHmac("sha256", secret).update(unsigned).digest("base64url");

    const sigBuf = Buffer.from(signatureB64, "base64url");
    const expectedBuf = Buffer.from(expectedSig, "base64url");

    if (sigBuf.length !== expectedBuf.length) return null;
    if (!timingSafeEqual(sigBuf, expectedBuf)) return null;

    const payload: JwtPayload = JSON.parse(
      Buffer.from(payloadB64, "base64url").toString("utf-8")
    );

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;
    if (payload.iss !== "scb") return null;

    return payload;
  } catch {
    return null;
  }
}

function getTokenFromRequest(req: NextRequest): string | null {
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  return null;
}

async function authenticateRequest(req: NextRequest): Promise<boolean> {
  const token = getTokenFromRequest(req);
  if (!token) return false;

  const jwtSecret = process.env.SCB_JWT_SECRET;
  if (!jwtSecret) {
    console.error("[gateway-api] SCB_JWT_SECRET not configured");
    return false;
  }

  const payload = verifyToken(token, jwtSecret);
  return payload !== null;
}

// Gateway control endpoints
// These would connect to the gateway via HTTP or socket

export async function POST(req: NextRequest) {
  // Authenticate request
  if (!(await authenticateRequest(req))) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  const { action } = await req.json();
  
  // In production, this would communicate with the gateway
  // For now, return the expected response structure
  
  switch (action) {
    case "restart":
      return NextResponse.json({ 
        success: true, 
        message: "Gateway restart initiated",
        action: "restart"
      });
      
    case "stop":
      return NextResponse.json({ 
        success: true, 
        message: "Gateway stop initiated",
        action: "stop"
      });
      
    case "status":
      return NextResponse.json({ 
        success: true, 
        status: "running",
        uptime: "1h 23m",
        version: "0.1.0"
      });
      
    default:
      return NextResponse.json({ 
        error: "Unknown action" 
      }, { status: 400 });
  }
}

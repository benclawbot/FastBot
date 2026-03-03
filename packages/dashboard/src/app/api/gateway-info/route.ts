/**
 * API endpoint for dashboard to discover the gateway port.
 *
 * This endpoint proxies the /gateway-info call from the gateway,
 * allowing the dashboard to dynamically discover the randomized port.
 */
export async function GET() {
  try {
    // Try to fetch gateway info from common ports (fallback mechanism)
    const portsToTry = [30000, 31337, 40000, 45000, 50000, 55000, 60000];

    for (const port of portsToTry) {
      try {
        const response = await fetch(
          `http://127.0.0.1:${port}/gateway-info`,
          {
            method: "GET",
            headers: { "Content-Type": "application/json" },
            signal: AbortSignal.timeout(1000),
          }
        );

        if (response.ok) {
          const data = await response.json();
          return Response.json(data, { status: 200 });
        }
      } catch {
        // Port not responding, try next
        continue;
      }
    }

    // If no gateway found, return error
    return Response.json(
      { error: "Gateway not found. Is it running?" },
      { status: 503 }
    );
  } catch (error) {
    return Response.json(
      { error: "Failed to discover gateway" },
      { status: 500 }
    );
  }
}

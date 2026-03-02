/**
 * Playwright worker — runs as a separate supervised process.
 * Communicates with the gateway via stdin/stdout JSON-RPC.
 */
import { chromium, type Browser, type Page } from "playwright";

interface TaskRequest {
  id: string;
  type: "scrape" | "automate" | "screenshot";
  url: string;
  actions?: Array<{ action: string; selector?: string; value?: string }>;
}

interface TaskResult {
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

let browser: Browser | null = null;

async function ensureBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
      ],
    });
  }
  return browser;
}

async function handleTask(req: TaskRequest): Promise<TaskResult> {
  const b = await ensureBrowser();
  const context = await b.newContext({
    userAgent:
      "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  });
  const page = await context.newPage();

  try {
    await page.goto(req.url, { waitUntil: "domcontentloaded", timeout: 30_000 });

    switch (req.type) {
      case "scrape": {
        const title = await page.title();
        const text = await page.evaluate(
          () => document.body.innerText.slice(0, 10_000)
        );
        return { id: req.id, success: true, data: { title, text } };
      }

      case "screenshot": {
        const buffer = await page.screenshot({ type: "png", fullPage: false });
        return {
          id: req.id,
          success: true,
          data: { screenshot: buffer.toString("base64") },
        };
      }

      case "automate": {
        const results: string[] = [];
        for (const action of req.actions ?? []) {
          if (action.action === "click" && action.selector) {
            await page.click(action.selector);
            results.push(`Clicked: ${action.selector}`);
          } else if (action.action === "fill" && action.selector && action.value) {
            await page.fill(action.selector, action.value);
            results.push(`Filled: ${action.selector}`);
          } else if (action.action === "wait") {
            await page.waitForTimeout(Number(action.value) || 1000);
            results.push(`Waited ${action.value}ms`);
          }
        }
        return { id: req.id, success: true, data: { results } };
      }

      default:
        return { id: req.id, success: false, error: `Unknown task type: ${req.type}` };
    }
  } catch (err) {
    return {
      id: req.id,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await context.close();
  }
}

// JSON-RPC over stdin/stdout
process.stdin.setEncoding("utf8");

let buffer = "";
process.stdin.on("data", (chunk: string) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";

  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      const req = JSON.parse(line) as TaskRequest;
      handleTask(req).then((result) => {
        process.stdout.write(JSON.stringify(result) + "\n");
      });
    } catch {
      process.stderr.write(`Invalid JSON: ${line}\n`);
    }
  }
});

process.on("SIGTERM", async () => {
  if (browser) await browser.close();
  process.exit(0);
});

// Signal readiness
process.stdout.write(JSON.stringify({ ready: true }) + "\n");

const { chromium } = require('playwright');

const PAGES = [
  { url: 'http://localhost:3100/', name: 'dashboard-home' },
  { url: 'http://localhost:3100/chat', name: 'dashboard-chat' },
  { url: 'http://localhost:3100/settings', name: 'dashboard-settings' },
  { url: 'http://localhost:3100/media', name: 'dashboard-media' },
  { url: 'http://localhost:3100/agents', name: 'dashboard-agents' },
  { url: 'http://localhost:3100/kanban', name: 'dashboard-kanban' },
  { url: 'http://localhost:3100/workflows', name: 'dashboard-workflows' },
  { url: 'http://localhost:3100/skills', name: 'dashboard-skills' },
  { url: 'http://localhost:3100/usage', name: 'dashboard-usage' },
  { url: 'http://localhost:3100/status', name: 'dashboard-status' },
  { url: 'http://localhost:3100/cron', name: 'dashboard-cron' },
];

async function takeScreenshots() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: '/usr/bin/google-chrome',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 1920, height: 1080 }
  });

  const page = await context.newPage();

  // Wait for dashboard to load and authenticate
  await page.goto('http://localhost:3100/', { waitUntil: 'networkidle' });

  // Check if we need to login - wait a bit for socket connection
  await page.waitForTimeout(2000);

  for (const p of PAGES) {
    console.log(`Taking screenshot of ${p.name}...`);
    try {
      await page.goto(p.url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForTimeout(1000); // Wait for any animations
      await page.screenshot({
        path: `docs/images/${p.name}.png`,
        fullPage: false
      });
      console.log(`  Saved: docs/images/${p.name}.png`);
    } catch (err) {
      console.error(`  Error on ${p.name}: ${err.message}`);
    }
  }

  await browser.close();
  console.log('Done!');
}

takeScreenshots().catch(console.error);

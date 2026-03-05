const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const consoleMessages = [];
  const consoleErrors = [];

  // Listen to console messages
  page.on('console', msg => {
    consoleMessages.push({ type: msg.type(), text: msg.text() });
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  // Listen to page errors
  page.on('pageerror', error => {
    consoleErrors.push(`Page Error: ${error.message}`);
  });

  console.log('=== Testing Dashboard at http://localhost:3100 ===\n');

  try {
    // 1. Check if page loads successfully
    console.log('1. Checking if page loads...');
    const response = await page.goto('http://localhost:3100', {
      waitUntil: 'networkidle',
      timeout: 30000
    });

    if (response) {
      const status = response.status();
      console.log(`   Status: ${status}`);
      if (status >= 200 && status < 300) {
        console.log('   SUCCESS: Page loaded with status 200-299');
      } else if (status >= 300 && status < 400) {
        console.log('   WARNING: Page redirected (status ' + status + ')');
      } else {
        console.log('   ERROR: Page failed to load (status ' + status + ')');
      }
    }

    // 2. Take screenshot
    console.log('\n2. Taking screenshot...');
    await page.screenshot({ path: '/home/tom/FastBot/packages/gateway/dashboard-screenshot.png', fullPage: true });
    console.log('   Screenshot saved to: /home/tom/FastBot/packages/gateway/dashboard-screenshot.png');

    // 3. Check page title
    console.log('\n3. Page title:', await page.title());

    // 4. Check for key elements
    console.log('\n4. Checking for key elements...');

    // Check for common dashboard elements
    const elements = await page.evaluate(() => {
      const checks = {
        'Body has content': document.body && document.body.innerText.length > 0,
        'Body text length': document.body ? document.body.innerText.length : 0,
      };

      // Try to find common dashboard elements
      const possibleSelectors = [
        'nav', 'header', 'footer', 'aside', 'main',
        '[role="navigation"]', '[role="banner"]', '[role="main"]',
        '.nav', '.header', '.footer', '.sidebar', '.dashboard',
        'h1', 'h2', 'h3'
      ];

      checks.possibleElements = possibleSelectors
        .map(sel => {
          try {
            const el = document.querySelector(sel);
            return el ? sel : null;
          } catch(e) { return null; }
        })
        .filter(Boolean);

      return checks;
    });

    console.log('   Body has content:', elements['Body has content']);
    console.log('   Body text length:', elements['Body text length']);
    console.log('   Found elements:', elements.possibleElements.join(', '));

    // 5. Test basic navigation if applicable
    console.log('\n5. Testing navigation links...');
    const navLinks = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href]'));
      return links.map(a => ({
        text: a.innerText.trim().substring(0, 50),
        href: a.href
      })).slice(0, 10); // Limit to first 10
    });

    if (navLinks.length > 0) {
      console.log('   Found', navLinks.length, 'navigation links:');
      navLinks.forEach(link => {
        console.log(`   - "${link.text}" -> ${link.href}`);
      });
    } else {
      console.log('   No navigation links found');
    }

    // 6. Console errors summary
    console.log('\n6. Console messages summary:');
    console.log('   Total messages:', consoleMessages.length);
    console.log('   Errors:', consoleErrors.length);

    if (consoleErrors.length > 0) {
      console.log('   ERROR DETAILS:');
      consoleErrors.forEach(err => console.log('   -', err));
    } else {
      console.log('   No console errors detected');
    }

    // Final result
    console.log('\n=== TEST RESULTS ===');
    if (response && response.status() >= 200 && response.status() < 400 && elements['Body has content']) {
      console.log('PASS: Dashboard is accessible and loaded successfully');
    } else {
      console.log('FAIL: Dashboard has issues');
    }

  } catch (error) {
    console.log('\nERROR:', error.message);
  } finally {
    await browser.close();
  }
})();

const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('console', msg => console.log('PAGE LOG:', msg.text()));
  page.on('pageerror', error => console.log('PAGE ERROR:', error.message));
  page.on('requestfailed', request => console.log('REQUEST FAILED:', request.url(), request.failure().errorText));

  // Visit the live Vercel URL
  await page.goto('https://ocean-project-taupe.vercel.app/ocean.html?id=2902345', { waitUntil: 'networkidle2' });
  
  // Wait a bit to ensure React has time to throw if it's going to
  await new Promise(r => setTimeout(r, 3000));
  
  await browser.close();
})();

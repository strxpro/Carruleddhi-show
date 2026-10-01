const puppeteer = require('puppeteer');
(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  
  page.on('pageerror', err => {
    console.log('PAGE ERROR:', err.toString());
  });
  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('CONSOLE ERROR:', msg.text());
    }
  });

  console.log('Navigating to http://localhost:5173/admin.html...');
  await page.goto('http://localhost:5173/admin.html');
  
  // Wait for React to mount
  await new Promise(r => setTimeout(r, 2000));
  
  // Enter password
  const passwordInput = await page.$('input[type="password"]');
  if (passwordInput) {
    console.log('Logging in...');
    await passwordInput.type('Yx3Qc695yx3hrx');
    await page.keyboard.press('Enter');
    await new Promise(r => setTimeout(r, 3000));
  } else {
    console.log('No password input found, maybe already logged in?');
  }
  
  console.log('Clicking Stream tab...');
  const streamTab = await page.$('button[id="stream"]');
  if (streamTab) {
    await streamTab.click();
    await new Promise(r => setTimeout(r, 2000));
  } else {
    console.log('Stream tab not found! Trying to click by text...');
    const streamByText = await page.$x("//span[contains(text(), 'Transmisja')]");
    if (streamByText.length > 0) {
      await streamByText[0].click();
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  
  console.log('Done!');
  await browser.close();
})();

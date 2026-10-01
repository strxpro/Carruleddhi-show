import assert from 'node:assert/strict';
import puppeteer from 'puppeteer';

const origin = process.env.CHAT_TEST_ORIGIN || 'http://127.0.0.1:5199';
assert.ok(['127.0.0.1', 'localhost'].includes(new URL(origin).hostname), 'local test server only');
const browser = await puppeteer.launch({ headless: true });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

try {
  for (const mobile of [false, true]) {
    const page = await browser.newPage();
    const errors = [], requests = [];
    let intent = null, pollMessages = [], serial = 0, failPrint = false, minor = false, failProfile = false;
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport(mobile
      ? { width: 390, height: 844, isMobile: true, hasTouch: true }
      : { width: 1440, height: 900 });
    await page.evaluateOnNewDocument(() => {
      if (window.top !== window) return;
      localStorage.setItem('carruleddhi.lang', 'pl');
      localStorage.setItem('carruleddhi.chat.name', 'Test');
      localStorage.setItem('carruleddhi.chat.email', 'test@example.invalid');
      const real = window.visualViewport;
      let inset = 0;
      class Viewport extends EventTarget {
        get width() { return real.width; }
        get height() { return real.height - inset; }
        get offsetTop() { return real.offsetTop; }
        get offsetLeft() { return real.offsetLeft; }
        get scale() { return real.scale; }
      }
      const view = new Viewport();
      Object.defineProperty(window, 'visualViewport', { get: () => view });
      window.testKeyboard = value => {
        inset = value;
        view.dispatchEvent(new Event('resize'));
        view.dispatchEvent(new Event('scroll'));
      };
    });
    await page.setRequestInterception(true);
    page.on('request', request => {
      const url = new URL(request.url());
      if (!url.pathname.startsWith('/api/')) {
        return url.origin === origin || ['data:', 'blob:'].includes(url.protocol)
          ? request.continue() : request.abort();
      }
      const body = JSON.parse(request.postData() || '{}');
      requests.push({ path: url.pathname, ...body });
      const respond = data => request.respond({ status: 200, contentType: 'application/json', body: JSON.stringify(data) });
      if (url.pathname.endsWith('/chat')) {
        if (body.action === 'profile') return respond(failProfile ? { ok: false } : { ok: true, profile: { name: body.name, email: body.email } });
        if (body.action === 'open') return respond({ ok: true, mode: 'ai', messages: Array.from({ length: 30 }, (_, i) => ({ id: `history-${i}`, author: 'ai', body: `History ${i}: sample answer. `.repeat(5) })) });
        if (body.action === 'poll') { const messages = pollMessages; pollMessages = []; return respond({ ok: true, mode: 'ai', messages }); }
        if (body.action === 'send') return respond({ ok: true, mode: 'ai', messageId: `sent-${++serial}`, replyId: `reply-${serial}`, ...(intent ? { selfService: intent } : { reply: 'Mock answer' }) });
        return respond({ ok: true, mode: 'ai' });
      }
      if (url.pathname.endsWith('/entry-lookup')) return respond({ ok: true, entries: [{ id: 'entry-test', minor, withdrawn: false }] });
      if (url.pathname.endsWith('/verify-start')) return respond({ ok: true, email: 't***t@example.invalid' });
      if (url.pathname.endsWith('/verify-code')) return respond({ ok: true, verified: true });
      if (url.pathname.endsWith('/entry-manage')) return respond(failPrint ? { ok: false, code: 'ENTRY_FAILED' } : { ok: true, entry: { wantsPrint: false } });
      if (url.pathname.endsWith('/sponsor-lead')) return respond({ ok: true });
      return respond({ ok: true, settings: {}, messages: [], rows: [], participants: [] });
    });
    await page.goto(`${origin}/?skipIntro=1`, { waitUntil: 'networkidle0' });
    await page.waitForSelector('[data-chat-ready="yes"]');
    await page.evaluate(() => document.querySelector('[data-chat-form]').scrollIntoView({ block: 'center', behavior: 'instant' }));
    await sleep(500);
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        const rect = document.querySelector('[data-chat-input]').getBoundingClientRect();
        window.scrollBy({ top: rect.top - innerHeight / 2, behavior: 'instant' });
      });
      await sleep(200);
    }
    const position = () => page.evaluate(() => {
      const log = document.querySelector('[data-chat-log]');
      const field = document.querySelector('[data-chat-input]').getBoundingClientRect();
      const contact = document.querySelector('#contact');
      return { y: scrollY, height: document.documentElement.scrollHeight, top: log.scrollTop, gap: log.scrollHeight - log.clientHeight - log.scrollTop, field: { top: field.top, bottom: field.bottom }, contactTop: contact.scrollTop };
    });
    await page.evaluate(() => {
      document.activeElement?.blur();
      document.querySelector('[data-chat-log]').scrollTop = 200;
    });
    const before = await position();
    if (mobile) await page.tap('[data-chat-input]');
    else await page.click('[data-chat-input]');
    await page.type('[data-chat-input]', 'Typing while reading history');
    await sleep(100);
    const after = await position();
    assert.equal(after.top, before.top, 'focusing/typing preserves history scroll');
    assert.equal(after.y, before.y, `focusing/typing preserves page scroll ${JSON.stringify({ before, after })}`);
    assert.equal(after.height, before.height, 'typing preserves document height');
    const fill = value => page.$eval('[data-chat-input]', (el, value) => { el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); }, value);
    const say = async value => {
      await fill(value);
      await page.$eval('[data-chat-form]', form => form.requestSubmit());
      await sleep(650);
    };
    const chip = async key => {
      await page.waitForFunction(key => [...document.querySelectorAll('[data-chat-chips-list] button')].some(el => el.textContent === window.CARRULEDDHI_API.text(key)), {}, key);
      await page.evaluate(key => [...document.querySelectorAll('[data-chat-chips-list] button')].find(el => el.textContent === window.CARRULEDDHI_API.text(key)).click(), key);
      await sleep(650);
    };
    const hasLine = key => page.evaluate(key => document.querySelector('[data-chat-log]').textContent.includes(window.CARRULEDDHI_API.text(key)), key);
    const summary = () => page.$$eval('[data-chat-summary]', els => els.at(-1)?.textContent || '');
    const code = async () => {
      await page.waitForSelector('[data-chat-code]');
      await page.$eval('[data-chat-code]', el => { el.value = '123456'; el.dispatchEvent(new Event('input', { bubbles: true })); });
      await sleep(800);
      assert.equal(await page.$eval('[data-chat-log]', el => el.textContent.includes('123456')), false, 'OTP never appears in transcript');
    };

    await fill('A long draft line\n'.repeat(12));
    await sleep(100);
    assert.equal((await position()).top, before.top, 'multiline draft preserves older history');
    if (mobile) {
      const keyboardBefore = await position();
      await page.evaluate(() => window.testKeyboard(400));
      await sleep(150);
      const keyboardOpen = await position();
      assert.equal(keyboardOpen.top, keyboardBefore.top, 'keyboard preserves older history');
      assert.equal(keyboardOpen.y, keyboardBefore.y, 'keyboard does not move outside page');
      assert.equal(keyboardOpen.height, keyboardBefore.height, 'keyboard keeps document height');
      assert.equal(await page.$eval('[data-chat-form]', el => {
        const rect = el.getBoundingClientRect();
        return rect.top >= visualViewport.offsetTop && rect.bottom <= visualViewport.offsetTop + visualViewport.height;
      }), true, 'composer stays visible above simulated keyboard');
      await page.evaluate(() => window.testKeyboard(0));
      await sleep(150);
      assert.equal((await position()).y, keyboardBefore.y, 'keyboard close restores same page position');
    }
    await fill('');
    const incomingBefore = await position();
    pollMessages = [{ id: 'incoming-older', author: 'organiser', body: 'Incoming mock message' }];
    await page.waitForSelector('[data-mid="incoming-older"]');
    assert.equal((await position()).top, incomingBefore.top, 'incoming message does not steal older history');
    await page.$eval('[data-chat-log]', el => { el.scrollTop = el.scrollHeight; });
    pollMessages = [{ id: 'incoming-bottom', author: 'organiser', body: 'Incoming at bottom' }];
    await page.waitForSelector('[data-mid="incoming-bottom"]');
    assert.ok((await position()).gap < 4, 'incoming follows when already at bottom');
    await page.$eval('[data-chat-log]', el => { el.scrollTop -= 30; });
    const nearBottom = await position();
    await fill('a');
    await sleep(100);
    assert.equal((await position()).top, nearBottom.top, 'ordinary keystroke does not force bottom scroll');

    intent = 'sponsor';
    await say('Chcia\u0142bym zosta\u0107 sponsorem');
    intent = null;
    await chip('chat.sponsorYes');
    await say('Test cart');
    await chip('chat.sponsorConsentRead');
    await page.waitForSelector('[data-consent-scroll]');
    for (let i = 0; i < 20; i++) {
      await page.$eval('[data-consent-scroll]', el => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll')); });
      if (await page.$eval('[data-consent-accept]', el => !el.disabled)) break;
      await sleep(150);
    }
    await page.$eval('[data-consent-accept]', el => el.click());
    await sleep(650);
    await say('Mario Rossi');
    await chip('chat.sponsorPhoneSkip');
    await chip('chat.sponsorLogoSkip');
    await chip('chat.sponsorLinkNone');
    await say('sponsor@example.invalid');
    await page.waitForSelector('[data-chat-summary]');
    assert.equal(requests.filter(r => r.path.endsWith('/verify-start') || r.path.endsWith('/sponsor-lead')).length, 0, 'no mail/submission before explicit summary confirmation');
    assert.equal(await page.$$eval('[data-chat-summary]:last-of-type [data-chat-edit]', els => els.length), 6, 'six visible field edits');

    await page.evaluate(() => document.querySelector('[data-language-option="it"]').click());
    assert.ok(await page.$('[data-chat-chips-list] [data-i18n="chat.sponsorSummaryYes"]'), 'language switch preserves confirmation flow');
    for (const [field, expected, replacement] of [['person', 'Mario Rossi', 'Luca D\u2019Angelo'], ['name', 'Test cart', 'Revised cart'], ['phone', '', '+39 123 456 789'], ['email', 'sponsor@example.invalid', 'revised@example.invalid'], ['link', '', 'https://example.invalid']]) {
      await page.$$eval('[data-chat-summary]', (els, field) => els.at(-1).querySelector(`[data-chat-edit="${field}"]`).click(), field);
      assert.equal(await page.$eval('[data-chat-input]', el => el.value), expected, 'edit prefills current field');
      await say(replacement);
      assert.ok((await summary()).includes(replacement), 'summary shows corrected field');
    }
    assert.ok((await summary()).includes('Luca D\u2019Angelo'));
    assert.ok((await summary()).includes('Revised cart'));
    assert.equal(await page.$$eval('[data-chat-summary]', els => [...els].slice(0, -1).every(el => [...el.querySelectorAll('button')].every(button => button.disabled))), true, 'old summary controls cannot edit current draft');
    await chip('chat.sponsorSummaryYes');
    await code();
    const submission = requests.find(r => r.path.endsWith('/sponsor-lead'));
    assert.equal(submission.firstName, 'Luca');
    assert.equal(submission.lastName, 'D\u2019Angelo');
    assert.equal(submission.email, 'revised@example.invalid');
    assert.equal(submission.consent, true);
    assert.equal(submission.code, '123456');
    assert.equal(requests.filter(r => r.action === 'send').length, 1, 'deterministic flow answers never sent to model');

    intent = 'print';
    await say('Non ho una stampante');
    intent = null;
    await chip('chat.gateChangeEmail');
    await say('other@example.invalid');
    assert.equal(requests.filter(r => r.path.endsWith('/verify-start')).at(-1).purpose, 'edit-entry', 'print email correction never becomes unsubscribe');
    await code();
    const view = requests.filter(r => r.path.endsWith('/entry-manage')).at(-1);
    assert.equal(view.action, 'view');
    assert.equal(view.entryId, 'entry-test');
    assert.equal(view.id, undefined);
    failPrint = true;
    await chip('chat.printChooseYes');
    assert.equal(await hasLine('chat.printSetYes'), false, 'failed action never reports success');
    assert.equal(await hasLine('chat.dataFailed'), true);
    assert.equal(requests.filter(r => r.path.endsWith('/notify-off')).length, 0);

    minor = true;
    intent = 'edit';
    const mailCount = requests.filter(r => r.path.endsWith('/verify-start')).length;
    await say('Correggere i miei dati');
    intent = null;
    assert.equal(await hasLine('entry.minorHelp'), true, 'minor restriction preserved');
    assert.equal(requests.filter(r => r.path.endsWith('/verify-start')).length, mailCount, 'no OTP for forbidden minor edit');
    intent = 'unexpected-tool';
    await say('Unexpected server marker');
    intent = null;
    await say('ordinary follow-up');
    assert.equal(requests.filter(r => r.path.endsWith('/verify-start')).length, mailCount, 'unknown workflow never initiates another action');
    assert.equal(requests.filter(r => r.action === 'send').at(-1).message, 'ordinary follow-up', 'unknown workflow leaves normal chat usable');
    const originalToken = await page.evaluate(() => localStorage.getItem('carruleddhi.chatToken'));
    const historyCount = await page.$$eval('[data-chat-log] > *', els => els.length);
    await page.$eval('[data-chat-profile]', el => el.click());
    assert.equal(await page.$eval('#chat-gate-name', el => el.value), 'Test', 'profile edit prefills current name');
    assert.equal(await page.$eval('#chat-gate-email', el => el.value), 'test@example.invalid');
    await page.$eval('#chat-gate-name', el => { el.value = 'Revised Person'; });
    await page.$eval('#chat-gate-email', el => { el.value = 'contact@example.invalid'; });
    failProfile = true;
    await page.$eval('[data-chat-gate-form]', el => el.requestSubmit());
    await page.waitForSelector('[data-chat-profile-error]:not([hidden])');
    assert.equal(await page.evaluate(() => localStorage.getItem('carruleddhi.chat.name')), 'Test', 'failed profile request never changes stored identity');
    assert.equal(await page.$eval('#chat-gate-name', el => el.value), 'Revised Person', 'failure preserves editable draft');
    failProfile = false;
    await page.$eval('[data-chat-gate-form]', el => el.requestSubmit());
    await page.waitForFunction(() => localStorage.getItem('carruleddhi.chat.name') === 'Revised Person');
    assert.equal(await page.evaluate(() => localStorage.getItem('carruleddhi.chat.email')), 'contact@example.invalid');
    assert.equal(await page.evaluate(() => localStorage.getItem('carruleddhi.chatToken')), originalToken, 'profile correction keeps same conversation token');
    assert.equal(await page.$$eval('[data-chat-log] > *', els => els.length), historyCount, 'profile correction retains transcript');
    await page.$eval('[data-chat-profile]', el => el.click());
    await page.$eval('#chat-gate-name', el => { el.value = 'Cancelled draft'; });
    await page.$eval('[data-chat-profile-cancel]', el => el.click());
    assert.equal(await page.evaluate(() => localStorage.getItem('carruleddhi.chat.name')), 'Revised Person', 'cancel does not persist profile edits');
    assert.equal(requests.filter(r => r.action === 'profile').length, 2);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'no page horizontal overflow');
    assert.deepEqual(errors, []);
    console.log(`PASS chat ${mobile ? 'mobile' : 'desktop'} scroll, keyboard, localized editable summary, OTP, print routing/error and minor guard`);
    await page.close();
  }
} finally {
  await browser.close();
}

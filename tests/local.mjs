// Requires an existing Playwright installation and Chromium. Installs nothing.
// Start `node scripts/serve.mjs`, then:
// LUMEN_TEST_VIDEO=/path/to/silent-1080p.mp4 node tests/local.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const fixture = await readFile(process.env.LUMEN_TEST_VIDEO);
const base = process.env.LUMEN_TEST_URL || 'http://localhost:8080';
const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium', headless: true,
    args: ['--no-sandbox']
});
let checks = 0;
function ok(value, message) { assert.ok(value, message); console.log('PASS', ++checks, message); }
async function key(page, code, type = 'press', repeat = false) {
    return page.evaluate(({ code, type, repeat }) => {
        function send(eventType) {
            const e = new KeyboardEvent(eventType, { keyCode: code, which: code, repeat, bubbles: true, cancelable: true });
            document.activeElement.dispatchEvent(e);
            return e.defaultPrevented;
        }
        if (type === 'press') { const cancelled = send('keydown'); send('keyup'); return cancelled; }
        return send(type);
    }, { code, type, repeat });
}
async function tile(page, label) {
    const target = await page.locator('#grid .t-label').allTextContents();
    const index = target.indexOf(label);
    assert.ok(index >= 0, 'missing tile ' + label);
    let current = await page.locator('#grid .tile').evaluateAll(els => els.findIndex(e => e.classList.contains('focus')));
    while (Math.floor(current / 6) !== Math.floor(index / 6)) {
        await key(page, current < index ? 40 : 38);
        current = await page.locator('#grid .tile').evaluateAll(els => els.findIndex(e => e.classList.contains('focus')));
    }
    while (current !== index) { await key(page, current < index ? 39 : 37); current += current < index ? 1 : -1; }
    await key(page, 13);
}
async function createPage({ style = 'images', urls = [], mode = 'video', tizen = true, startupMs = 8000, stallMs = 5000, clock = false, configured = false } = {}) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const page = await context.newPage();
    if (clock) await page.clock.install();
    const errors = [], requests = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(({ style, tizen }) => {
        if (!localStorage.getItem('glass.prefs.v1')) localStorage.setItem('glass.prefs.v1', JSON.stringify({ lang: 'en', saverStyle: style, saverMin: 5, hdmiNames: { 1: 'playstation' } }));
        window.__calls = { launches: [], sources: [], exits: 0, native: [], registered: [] };
        if (!tizen) return;
        window.webapis = { appcommon: {
            AppCommonScreenSaverState: { SCREEN_SAVER_ON: 1, SCREEN_SAVER_OFF: 0 },
            setScreenSaver(state, success) { window.__calls.native.push(state); success(); }
        }};
        window.tizen = {
            application: {
                getCurrentApplication() { return { appInfo: { id: 'GlassLnch1.Glass' }, exit() { window.__calls.exits++; }, hide() {} }; },
                getAppsInfo(success) { success([
                    { id: 'org.tizen.netflix-app', name: 'Netflix', show: true },
                    { id: '9Ur5IzDKqV.TizenYouTube', name: 'YouTube', show: true },
                    { id: 'com.samsung.tv.aria-video', name: 'Apple TV', show: true }
                ]); },
                launch(id, success) { window.__calls.launches.push(id); success(); }
            },
            systeminfo: { getPropertyValue(name, success) {
                success(name === 'LOCALE' ? { language: 'en_US' } : { connected: [{ type: 'HDMI', number: 1 }], disconnected: [] });
            }},
            tvwindow: { setSource(src, success) { window.__calls.sources.push(src.number); success(); } },
            tvinputdevice: { registerKey(name) { window.__calls.registered.push(name); } }
        };
    }, { style, tizen });
    if (mode === 'reject') await page.addInitScript(() => {
        HTMLMediaElement.prototype.play = function () { return Promise.reject(new Error('autoplay denied')); };
    });
    await page.route('**/*', async route => {
        const url = route.request().url();
        if (url.startsWith('https://aerial.test/')) {
            requests.push(url);
            if (mode === 'hang') { await new Promise(r => setTimeout(r, 1600)); return route.abort().catch(() => {}); }
            if (mode === 'error') return route.fulfill({ status: 404, body: '' });
            if (mode === 'corrupt') return route.fulfill({ contentType: 'video/mp4', body: 'invalid MP4' });
            return route.fulfill({ contentType: 'video/mp4', body: fixture });
        }
        if (url.endsWith('/js/config.js')) {
            if (configured) return route.continue();
            const response = await route.fetch();
            return route.fulfill({ response, body: (await response.text()) + '\nGLASS_CONFIG.aerial = ' + JSON.stringify({ urls, startupMs, stallMs }) + ';' });
        }
        if (url.startsWith(base + '/media/')) { requests.push(url); return route.continue(); }
        if (url.endsWith('/js/config.local.js') || url.includes('$WEBAPIS')) return route.fulfill({ contentType: 'text/javascript', body: '' });
        if (url.startsWith(base)) return route.continue();
        return route.abort();
    });
    await page.goto(base);
    await page.waitForFunction(() => document.querySelectorAll('#grid .tile').length > 0);
    return { page, context, errors, requests };
}
async function saver(page) { await tile(page, 'Screen Saver'); await page.waitForSelector('#saver.on'); }
async function playing(page) { await page.waitForFunction(() => document.querySelector('video') && document.querySelector('video').currentTime > 0.1); }
const url = 'https://aerial.test/silent.mp4';
try {
    const nav = await createPage();
    const p = nav.page;
    await key(p, 39);
    const focused = await p.locator('#grid .tile.focus .t-label').textContent();
    ok(await key(p, 10009, 'keydown'), 'short TV Back is cancelled locally');
    ok(await p.locator('#exit-stay').evaluate(e => e === document.activeElement), 'root confirmation defaults to Stay');
    await key(p, 10009, 'keydown', true);
    ok(await p.locator('#exit-dialog').evaluate(e => e.classList.contains('open')), 'held Back cannot cascade through confirmation');
    await key(p, 10009, 'keyup');
    await key(p, 10009);
    ok(await p.locator('#grid .tile.focus .t-label').textContent() === focused, 'Back cancels confirmation and preserves grid focus');
    await key(p, 10009); await key(p, 13);
    ok(await p.locator('#exit-dialog').evaluate(e => !e.classList.contains('open')), 'OK on Stay keeps Lumen open');
    await key(p, 10009); await key(p, 39); await key(p, 13);
    ok(await p.evaluate(() => __calls.exits === 1), 'only explicit Exit calls Tizen exit');
    await key(p, 10009); // mock exit does not terminate the browser; close the dialog
    await key(p, 406);
    ok(await p.locator('#panel.open').count() === 1, 'Blue opens Settings');
    while (!((await p.locator('#opts .focus').textContent()).includes('About'))) await key(p, 40);
    await key(p, 13); await key(p, 10009, 'keydown');
    ok(await p.locator('#panel.open:not(.about-open)').count() === 1, 'About Back restores Settings');
    await key(p, 10009, 'keydown', true);
    ok(await p.locator('#panel.open').count() === 1, 'held Back does not skip Settings');
    await key(p, 10009, 'keyup'); await key(p, 10009);
    ok(await p.locator('#panel.open').count() === 0 && await p.locator('#exit-dialog.open').count() === 0, 'Settings Back returns to grid without exit dialog');
    await key(p, 404); await key(p, 10009);
    ok(await p.locator('#library.open').count() === 0, 'Library Back returns to grid');
    await key(p, 13, 'keydown'); await p.waitForTimeout(650); await key(p, 13, 'keyup');
    await key(p, 10009);
    ok(await p.locator('#stage.editing').count() === 0 && await p.locator('#exit-dialog.open').count() === 0, 'Back leaves app editing without exiting');
    await saver(p);
    ok(await p.locator('video').count() === 0 && nav.requests.length === 0, 'Images uses no video element or media request');
    for (const code of [10182, 10072, 102, 447]) ok(!(await key(p, code)), 'system/unknown key ' + code + ' remains uncancelled');
    await key(p, 10009);
    ok(nav.errors.length === 0, 'navigation produces no uncaught browser errors');
    await nav.context.close();

    const media = await createPage({ style: 'aerial', urls: [url] });
    const m = media.page;
    ok(media.requests.length === 0 && await m.locator('video').count() === 0, 'Aerial makes no request and owns no player on the grid');
    await saver(m); await playing(m);
    await m.evaluate(() => { window.__oldVideo = document.querySelector('video'); });
    ok(await m.evaluate(() => __oldVideo.muted && __oldVideo.defaultMuted && __oldVideo.preload === 'none' && !__oldVideo.controls && __oldVideo.tabIndex === -1), 'single player is muted, unfocusable and does not preload');
    ok(await m.evaluate(() => __calls.native.includes(0)), 'active playback disables native saver through guarded API');
    await key(m, 10009, 'keydown'); await key(m, 10009, 'keydown', true); await key(m, 10009, 'keyup');
    ok(await m.locator('video').count() === 0 && await m.locator('#exit-dialog.open').count() === 0, 'Back dismisses Aerial to grid without a second action');
    ok(await m.evaluate(() => __oldVideo.paused && !__oldVideo.hasAttribute('src') && __oldVideo.networkState === 0 && !__oldVideo.isConnected && __calls.native.slice(-1)[0] === 1), 'dismissal resets fetching and restores native protection');
    const count = media.requests.length;
    await m.evaluate(() => { __oldVideo.dispatchEvent(new Event('playing')); __oldVideo.dispatchEvent(new Event('ended')); });
    ok(media.requests.length === count && await m.locator('video').count() === 0, 'late detached video events cannot restart playback');
    await saver(m); await playing(m); await key(m, 13, 'keydown'); await key(m, 13, 'keydown', true); await key(m, 13, 'keyup');
    ok(await m.locator('video').count() === 0 && await m.locator('#saver.on').count() === 0 && await m.evaluate(() => __calls.launches.length === 0), 'Enter dismissal cannot reopen saver or launch an app');
    await saver(m); await playing(m);
    await m.evaluate(() => { document.querySelector('video').dispatchEvent(new Event('ended')); });
    await playing(m);
    ok(await m.locator('video').count() === 1, 'playlist advancement retains exactly one player');
    await m.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
    ok(await m.locator('video').count() === 0 && await m.locator('#saver.on').count() === 0, 'hidden application immediately destroys video and overlay');
    await m.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
    await m.waitForTimeout(100);
    ok(await m.locator('video').count() === 0, 'resume returns to launcher without restarting video');
    await saver(m); await playing(m);
    await m.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    ok(await m.locator('video').count() === 0, 'pagehide destroys playback');
    await saver(m); await playing(m); await key(m, 10009);
    await tile(m, 'YouTube'); await m.waitForTimeout(450);
    ok(await m.evaluate(() => __calls.launches.includes('9Ur5IzDKqV.TizenYouTube') && !document.querySelector('video')), 'YouTube launch works after aerial cleanup');
    await m.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await m.waitForTimeout(600);
    await tile(m, 'PlayStation'); await m.waitForTimeout(450);
    ok(await m.evaluate(() => __calls.sources.includes(1) && __calls.launches.includes('org.tizen.tv-viewer')), 'HDMI source switching and TV viewer handoff remain intact');
    ok(media.errors.length === 0, 'media and handoff produce no uncaught browser errors');
    await media.context.close();

    for (const mode of ['error', 'corrupt', 'hang', 'reject']) {
        const test = await createPage({ style: 'aerial', urls: [url], mode, startupMs: 700 });
        await saver(test.page);
        await test.page.waitForFunction(() => document.querySelector('#saver.on:not(.aerial)') && !document.querySelector('video'));
        await test.page.waitForSelector('.saver-img.on');
        ok(await test.page.locator('.saver-img.on').count() === 1, mode + ' falls back to original image saver');
        const before = test.requests.length;
        await test.page.waitForTimeout(900);
        ok(test.requests.length === before && test.errors.length === 0, mode + ' does not retry or throw');
        await test.context.close();
    }
    const empty = await createPage({ style: 'aerial' });
    await saver(empty.page);
    ok(await empty.page.locator('#saver.on:not(.aerial)').count() === 1 && empty.requests.length === 0, 'missing owner URLs safely fall back without network access');
    await empty.context.close();

    const stalled = await createPage({ style: 'aerial', urls: [url], stallMs: 700 });
    await saver(stalled.page); await playing(stalled.page);
    await stalled.page.evaluate(() => document.querySelector('video').pause());
    await stalled.page.waitForSelector('#saver.on:not(.aerial)');
    ok(await stalled.page.locator('video').count() === 0, 'playback without progress times out and releases its decoder');
    await stalled.context.close();

    const cycles = await createPage({ style: 'aerial', urls: [url] });
    for (let i = 0; i < 100; i++) {
        await saver(cycles.page);
        await key(cycles.page, 10009);
        assert.equal(await cycles.page.locator('video').count(), 0);
    }
    ok(cycles.errors.length === 0, '100 rapid saver entry/exit cycles retain no player or uncaught error');
    await cycles.context.close();

    const idle = await createPage({ style: 'aerial', urls: [url], clock: true });
    await key(idle.page, 406);
    await idle.page.clock.fastForward(310000);
    ok(await idle.page.locator('#saver.on').count() === 1, 'idle timeout activates saver over Settings');
    await key(idle.page, 10009);
    ok(await idle.page.locator('#panel.open').count() === 0 && await idle.page.locator('#grid .tile.focus').count() === 1, 'Back from idle saver returns to app grid, not Settings');
    await idle.context.close();

    const prefsTest = await createPage();
    await key(prefsTest.page, 406);
    while (!((await prefsTest.page.locator('#opts .focus > span:first-of-type').textContent()).includes('Screen saver style'))) await key(prefsTest.page, 40);
    await key(prefsTest.page, 39);
    ok(await prefsTest.page.evaluate(() => {
        const prefs = JSON.parse(localStorage.getItem('glass.prefs.v1'));
        return prefs.saverStyle === 'aerial' && prefs.hdmiNames[1] === 'playstation' && prefs.saverMin === 5;
    }), 'style selection persists without losing existing HDMI or idle settings');
    await prefsTest.page.reload();
    await prefsTest.page.waitForSelector('#grid .tile');
    await key(prefsTest.page, 406);
    ok((await prefsTest.page.locator('#opts').textContent()).includes('Aerial video'), 'saved Aerial selection survives application reload');
    await prefsTest.context.close();

    const native = await createPage();
    ok(await native.page.evaluate(() => {
        const pending = [];
        webapis.appcommon.setScreenSaver = (state, callback) => pending.push({ state, callback });
        Platform.setNativeSaver(false);
        Platform.setNativeSaver(true);
        pending[1].callback();
        pending[0].callback();
        return pending.length === 3 && pending[2].state === 1;
    }), 'late native OFF acknowledgement reasserts newer ON state');
    ok(await native.page.evaluate(() => {
        webapis.appcommon.setScreenSaver = () => { throw new Error('not supported'); };
        Platform.setNativeSaver(false); Platform.setNativeSaver(true);
        return true;
    }), 'missing/throwing native saver API does not break launcher');
    ok(await native.page.evaluate(() => __calls.registered.every(k => k !== 'Exit' && k !== 'Home' && k !== 'Power' && k !== 'Back')), 'only original optional keys are registered, never system keys');
    await native.context.close();

    const images = await createPage();
    await images.page.evaluate(() => {
        window.__pendingImages = [];
        window.FEATURED = { netflix: [{ img: 'first.jpg', title: 'First' }] };
        Aurora.fromImage = () => new Promise(resolve => __pendingImages.push(resolve));
    });
    await saver(images.page); await key(images.page, 10009);
    await images.page.evaluate(() => { FEATURED.netflix = [{ img: 'second.jpg', title: 'Second' }]; });
    await saver(images.page);
    await images.page.evaluate(() => __pendingImages[0]({}));
    ok(await images.page.locator('.saver-img.on').count() === 0, 'old image callback cannot paint into a new saver session');
    await images.page.evaluate(() => __pendingImages[1]({}));
    await images.page.waitForFunction(() => document.querySelector('#saver-info .title').textContent === 'Second');
    ok(await images.page.locator('.saver-img.on').count() === 1, 'current image session still renders normally');
    await images.context.close();

    const packaged = await createPage({ style: 'aerial', configured: true });
    ok(packaged.requests.length === 0, 'bundled clip is not requested before saver entry');
    await saver(packaged.page); await playing(packaged.page);
    ok(await packaged.page.evaluate(() => {
        const video = document.querySelector('video');
        return video.videoWidth === 1920 && video.videoHeight === 1080 && video.duration > 27 && video.duration < 28;
    }), 'configured coastline clip decodes at 1920x1080 for its full 27-second duration');
    ok(packaged.requests.every(url => url.startsWith(base + '/media/')), 'configured clip plays from the app package without any external media host');
    if (process.env.LUMEN_TEST_SCREENSHOT) {
        await packaged.page.waitForFunction(() => getComputedStyle(document.querySelector('#saver')).opacity === '1');
        await packaged.page.screenshot({ path: process.env.LUMEN_TEST_SCREENSHOT });
    }
    await packaged.page.evaluate(() => { const video = document.querySelector('video'); video.currentTime = video.duration - 0.15; });
    await packaged.page.waitForFunction(() => {
        const video = document.querySelector('video');
        return video && video.currentTime > 0.1 && video.currentTime < 2;
    });
    ok(await packaged.page.locator('video').count() === 1 && await packaged.page.locator('#saver.aerial').count() === 1, 'coastline clip loops through one player without falling back');
    await key(packaged.page, 10009);
    ok(await packaged.page.locator('video').count() === 0 && packaged.errors.length === 0, 'Back releases the actual bundled clip without uncaught errors');
    await packaged.context.close();

    const range = await fetch(base + '/media/aerial-coast.mp4', { headers: { Range: 'bytes=0-31' } });
    const prefix = Buffer.from(await range.arrayBuffer());
    ok(range.status === 206 && range.headers.get('content-type') === 'video/mp4' && prefix.length === 32 && prefix.subarray(4, 8).toString() === 'ftyp', 'preview serves real MP4 byte ranges with the correct MIME type');
    const invalidRange = await fetch(base + '/media/aerial-coast.mp4', { headers: { Range: 'bytes=invalid' } });
    ok(invalidRange.status === 416, 'preview rejects malformed video ranges');
    const suffix = await fetch(base + '/media/aerial-coast.mp4', { headers: { Range: 'bytes=-16' } });
    ok(suffix.status === 206 && (await suffix.arrayBuffer()).byteLength === 16, 'preview supports suffix ranges');
    const head = await fetch(base + '/media/aerial-coast.mp4', { method: 'HEAD' });
    ok(head.status === 200 && Number(head.headers.get('content-length')) > 0 && (await head.arrayBuffer()).byteLength === 0, 'video HEAD reports size without transferring the clip');
    console.log('All', checks, 'local checks passed. No physical TV was contacted.');
} finally { await browser.close(); }

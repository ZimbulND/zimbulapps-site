// Dependency-free Chromium smoke checks via its DevTools protocol.
// Run with: node --experimental-websocket scripts/check-browser.cjs
// The workflow must already be running on port 5000.
// All nonlocal traffic and all POST/PUT/DELETE requests are blocked by this test.
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const base = "http://127.0.0.1:5000";
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  assert.equal(typeof WebSocket, "function", "Use node --experimental-websocket");
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "zimbul-readiness-"));
  const browser = spawn("chromium", [
    "--headless", "--no-sandbox", "--disable-dev-shm-usage",
    "--disable-background-networking", "--no-first-run",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  let output = "";
  browser.stderr.on("data", chunk => output += chunk);
  browser.on("error", error => output += error.message);
  let socket;
  try {
    for (let i = 0; i < 100 && !/DevTools listening on (ws:\/\/\S+)/.test(output); i++) await pause(100);
    const endpoint = /DevTools listening on (ws:\/\/\S+)/.exec(output)?.[1];
    assert.ok(endpoint, `Chromium did not start: ${output.slice(-1500)}`);
    const port = new URL(endpoint).port;
    const pages = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    socket = new WebSocket(pages.find(page => page.type === "page").webSocketDebuggerUrl);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    let sequence = 0;
    const pending = new Map();
    const listeners = new Map();
    const errors = [];
    const blocked = [];
    function send(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = ++sequence;
        const timer = setTimeout(() => { pending.delete(id); reject(Error(`Timeout: ${method}`)); }, 12000);
        pending.set(id, { resolve, reject, timer });
        socket.send(JSON.stringify({ id, method, params }));
      });
    }
    socket.addEventListener("message", event => {
      const message = JSON.parse(event.data);
      if (message.id && pending.has(message.id)) {
        const request = pending.get(message.id);
        pending.delete(message.id);
        clearTimeout(request.timer);
        if (message.error) request.reject(Error(JSON.stringify(message.error)));
        else request.resolve(message.result);
      }
      for (const fn of listeners.get(message.method) || []) fn(message.params);
    });
    function on(method, fn) { listeners.set(method, [...listeners.get(method) || [], fn]); }
    const evaluate = async expression => {
      const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
      assert.ok(!result.exceptionDetails, JSON.stringify(result.exceptionDetails));
      return result.result.value;
    };
    let simulateLicenseFailure = false;
    const entitlementFile = await fs.readFile(path.join(__dirname, "../job-profit-workbook/app/engine/webEntitlement.js"), "utf8");
    on("Fetch.requestPaused", async ({ requestId, request }) => {
      try {
        if (!request.url.startsWith(`${base}/`) || !["GET", "HEAD"].includes(request.method)) {
          blocked.push(`${request.method} ${request.url}`);
          await send("Fetch.failRequest", { requestId, errorReason: "Aborted" });
        } else if (simulateLicenseFailure && request.url.endsWith("/app/engine/webEntitlement.js")) {
          const source = entitlementFile.replace("async function evaluate() {", 'async function evaluate() { throw new Error("Simulated entitlement failure in isolated test");');
          await send("Fetch.fulfillRequest", {
            requestId, responseCode: 200,
            responseHeaders: [{ name: "Content-Type", value: "text/javascript" }],
            body: Buffer.from(source).toString("base64"),
          });
        } else await send("Fetch.continueRequest", { requestId });
      } catch (error) { errors.push(error.message); }
    });
    on("Runtime.exceptionThrown", ({ exceptionDetails }) => errors.push(exceptionDetails.text));
    await send("Page.enable");
    await send("Runtime.enable");
    await send("Network.enable");
    await send("Network.setCacheDisabled", { cacheDisabled: true });
    await send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
    async function navigate(route) {
      await send("Page.navigate", { url: base + route });
      for (let i = 0; i < 80; i++) {
        if (await evaluate(`location.pathname === ${JSON.stringify(route.split("?")[0])} && document.readyState === "complete"`)) return;
        await pause(75);
      }
      throw Error(`Page did not settle: ${route}`);
    }
    const routes = [
      "/", "/job-profit-workbook/", "/job-profit-workbook/purchase/success/",
      "/job-profit-workbook/purchase/cancel/", "/contact/received/", "/privacy/", "/terms/",
    ];
    let layouts = 0;
    for (const width of [320, 402, 1280]) {
      await send("Emulation.setDeviceMetricsOverride", { width, height: 874, deviceScaleFactor: 1, mobile: width < 650 });
      for (const route of routes) {
        await navigate(route);
        const result = await evaluate(`({
          width: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth,
          main: document.querySelectorAll("main").length, h1: document.querySelectorAll("h1").length,
          images: [...document.images].every(img => img.complete && img.naturalWidth > 0),
          nav: [...document.querySelectorAll("header nav a")].every(a => a.getBoundingClientRect().height >= 24)
        })`);
        assert.ok(result.scrollWidth <= result.width + 1, `${width}px ${route}: horizontal overflow ${JSON.stringify(result)}`);
        assert.equal(result.main, 1, route);
        assert.equal(result.h1, 1, route);
        assert.equal(result.images, true, `${route}: broken image`);
        assert.equal(result.nav, true, `${route}: navigation target below 24px`);
        layouts++;
      }
    }
    await navigate("/");
    await send("Input.dispatchKeyEvent", { type: "keyDown", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    await send("Input.dispatchKeyEvent", { type: "keyUp", key: "Tab", code: "Tab", windowsVirtualKeyCode: 9 });
    assert.equal(await evaluate('document.activeElement.classList.contains("skip-link") && document.activeElement.getBoundingClientRect().top >= 0'), true);
    assert.equal(await evaluate('document.querySelector("button[type=submit]").disabled'), true);
    assert.equal(await evaluate(`(() => {
      const event = new Event("submit", { bubbles: true, cancelable: true });
      document.querySelector('form[name="contact"]').dispatchEvent(event);
      return event.defaultPrevented && document.querySelector("#contact-status").textContent.includes("Nothing sent");
    })()`), true);
    await evaluate('location.hash = "#products"');
    assert.equal(await evaluate('document.querySelector(":target").id'), "products");

    for (const width of [320, 1280]) {
      await send("Emulation.setDeviceMetricsOverride", { width, height: 874, deviceScaleFactor: 1, mobile: width < 650 });
      await navigate("/job-profit-workbook/app/");
      for (let i = 0; i < 40 && !await evaluate('Boolean(document.querySelector("[data-action=connect-trial]"))'); i++) await pause(75);
      assert.equal(await evaluate('Boolean(document.querySelector("[data-action=connect-trial]"))'), true);
      assert.equal(await evaluate('document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1'), true);
      assert.equal(await evaluate('document.body.textContent.includes("not a verified limited free demo")'), true);
      assert.equal(await evaluate('Boolean(document.querySelector("[data-action=buy-license], [data-action=new-job]"))'), false);
    }
    simulateLicenseFailure = true;
    await navigate("/job-profit-workbook/app/?test-outage=1");
    for (let i = 0; i < 40 && !await evaluate('document.body.textContent.includes("Browser licensing unavailable")'); i++) await pause(75);
    assert.equal(await evaluate('document.body.textContent.includes("Browser licensing unavailable")'), true);
    assert.equal(await evaluate('Boolean(document.querySelector("[data-action=buy-license], [data-action=new-job], [data-action=connect-trial]"))'), false);
    assert.deepEqual(blocked, [], "Unexpected nonlocal or mutating request; all were blocked");
    assert.deepEqual(errors, []);
    console.log(`PASS: ${layouts} responsive page layouts (320/402/1280px), keyboard skip link, navigation targets, preview submission block, browser activation gate, and fail-closed outage UI. No external or mutating requests.`);
    await send("Browser.close");
  } finally {
    socket?.close();
    browser.kill("SIGTERM");
    await pause(300);
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });

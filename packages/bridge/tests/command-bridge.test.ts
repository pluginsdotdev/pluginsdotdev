import * as puppeteer from "puppeteer";
import { startServer as startTestServer } from "./test-server";

import type { PluginUrl, HostBridge } from "../src/types";
import type { Browser, Page } from "puppeteer";

jest.setTimeout(10000);

const hostPort = 8080;
const pluginPort = 8081;
const pluginUrl = "http://localhost:8081/tests/plugin.html";

describe("initializeHostBridge", () => {
  let browser: Browser;
  let page: Page;
  let shutdown: () => Promise<undefined>;
  beforeAll(async () => {
    const shutdown1 = await startTestServer(hostPort);
    const shutdown2 = await startTestServer(pluginPort);

    shutdown = async () => {
      await Promise.all([shutdown1(), shutdown2()]);
      return void 0;
    };
  });

  afterAll(async () => shutdown());

  beforeEach(async () => {
    browser = await puppeteer.launch({
      args: [
        "--disable-dev-shm-usage", // running in docker with small /dev/shm
        "--no-sandbox",
      ],
    });
    page = await browser.newPage();
    page.on("console", (c) => console.log("Log from puppeteer", c.text()));
    page.on("error", (e) => console.log("Error from puppeteer", e));
    await page.goto(`http://localhost:${hostPort}/tests/host.html`);
    // our js has been loaded
    await page.waitForFunction(() => !!(<any>window).index);
  });

  afterEach(async () => browser.close());

  it("intermediate iframe created", async () => {
    await page.evaluate(() => (<any>window).index.initializeHostBridge("host"));
    await page.waitForSelector("iframe");
    expect(await page.$("iframe")).toBeTruthy();
  });

  it("plugin iframe created", async () => {
    await page.evaluate(() => {
      (<any>window).index
        .initializeHostBridge("host")
        .then((makeBridge: (pluginUrl: PluginUrl) => HostBridge) =>
          makeBridge("http://localhost:8081/tests/plugin.html")
        );
    });
    await page.waitForSelector("iframe");
    await page.mainFrame().childFrames()[0].waitForSelector("iframe");
    expect(await page.mainFrame().childFrames()[0].$("iframe"));
  });

  it("render works", async () => {
    await page.evaluate(() => {
      (<any>window).index
        .initializeHostBridge("host")
        .then((makeBridge: (pluginUrl: PluginUrl) => HostBridge) => {
          return makeBridge("http://localhost:8081/tests/plugin.html");
        })
        .then((bridge: HostBridge) => {
          return bridge.render(234, { hello: "world" });
        });
    });
    await page.waitForSelector("iframe");
    await page.mainFrame().childFrames()[0].waitForSelector("iframe");
    await page
      .mainFrame()
      .childFrames()[0]
      .childFrames()[0]
      .waitForSelector('div[data-root-id="234"]');
    expect(
      await page
        .mainFrame()
        .childFrames()[0]
        .childFrames()[0]
        .$('div[data-root-id="234"]')
    ).toBeTruthy();
  });

  it("render and function invocations work", async () => {
    await page.evaluate(() => {
      const basicPropFn = (s: string) => {
        const d = document.createElement("div");
        d.setAttribute("data-prop-fn", s);
        document.body.appendChild(d);
      };
      return (<any>window).index
        .initializeHostBridge("host")
        .then((makeBridge: (pluginUrl: PluginUrl) => HostBridge) => {
          return makeBridge("http://localhost:8081/tests/plugin.html");
        })
        .then((bridge: HostBridge) => {
          return bridge.render(234, { basicPropFn });
        });
    });
    await page.waitForSelector('div[data-prop-fn="hello"]');
    expect(await page.$('div[data-prop-fn="hello"]')).toBeTruthy();
  });

  it("render and function 3-level invocations work", async () => {
    await page.evaluate(() => {
      const callback2 = (s: string) => {
        const d = document.createElement("div");
        d.setAttribute("data-prop-fn", s);
        document.body.appendChild(d);
      };
      const callbackFn = (
        s: string,
        fn: (val: string, cb2: (s: string) => void) => void
      ) => {
        fn(s + " world", callback2);
      };
      return (<any>window).index
        .initializeHostBridge("host")
        .then((makeBridge: (pluginUrl: PluginUrl) => HostBridge) => {
          return makeBridge("http://localhost:8081/tests/plugin.html");
        })
        .then((bridge: HostBridge) => {
          return bridge.render(234, { callbackFn });
        });
    });
    await page.waitForSelector('div[data-prop-fn="hello world!"]');
    expect(await page.$('div[data-prop-fn="hello world!"]')).toBeTruthy();
  });
});

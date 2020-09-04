import * as puppeteer from "puppeteer";
import { startServer as startTestServer } from "./test-server";

import type { PluginId, Bridge } from "../src/types";
import type { Browser, Page } from "puppeteer";

jest.setTimeout(10000);

const hostPort = 8080;
const pluginPort = 8081;

describe("initializeBridge", () => {
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
    await page.evaluate(() => (<any>window).index.initializeBridge("host"));
    await page.waitForSelector("iframe");
    expect(await page.$("iframe")).toBeTruthy();
  });

  it("plugin iframe created", async () => {
    await page.evaluate(() => {
      (<any>window).index
        .initializeBridge("host")
        .then((makeBridge: (pluginId: PluginId) => Promise<Bridge>) =>
          makeBridge("plugin")
        );
    });
    await page.waitForFunction(() => window.frames[0].frames[0]);
    expect(await page.evaluate(() => window.frames[0].frames[0])).toBeTruthy();
  });
});

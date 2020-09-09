import React from "react";
import puppeteer from "puppeteer";
import { startServer as startTestServer } from "../../bridge/tests/test-server";

import type { Browser, Page } from "puppeteer";
import type {
  PluginUrl,
  HostBridge,
  RenderRootId,
  ReconciliationUpdate,
} from "@pluginsdotdev/bridge";

const hostPort = 8080;
const pluginPort = 8081;

describe("react-plugin", () => {
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

  it("basic rendering should work", async () => {
    await page.evaluate(() => {
      (<any>window).index
        .initializeHostBridge(
          "host",
          (rootId: RenderRootId, updates: Array<ReconciliationUpdate>) => {
            const d = document.createElement("div");
            d.id = "target";
            d.textContent = JSON.stringify({ rootId, updates });
            document.body.appendChild(d);
          }
        )
        .then((makeBridge: (pluginUrl: PluginUrl) => HostBridge) =>
          makeBridge("http://localhost:8081/tests/plugin.html")
        )
        .then((bridge: HostBridge) => {
          bridge.render(123, { className: "my-class", title: "Hello World!" });
        });
    });
    await page.waitForSelector("div#target");
    const json = await page.evaluate(
      () => document.getElementById("target")!.textContent
    );
    const { rootId, updates } = JSON.parse(json!);
    expect(rootId).toEqual(123);
    expect(updates).toContainEqual({
      nodeId: expect.any(Number),
      type: "text",
      textUpdate: {
        text: "Hello World!",
      },
    });
    expect(updates).toContainEqual({
      nodeId: expect.any(Number),
      type: "p",
      propUpdates: [],
    });
    expect(updates).toContainEqual({
      nodeId: expect.any(Number),
      type: "p",
      childUpdates: [
        {
          op: "set",
          childIdx: 0,
          childId: expect.any(Number),
        },
      ],
    });
    expect(updates).toContainEqual({
      nodeId: expect.any(Number),
      type: "div",
      propUpdates: [
        {
          op: "set",
          prop: "className",
          value: "my-class",
        },
      ],
    });
    expect(updates).toContainEqual({
      nodeId: expect.any(Number),
      type: "div",
      childUpdates: [
        {
          op: "set",
          childIdx: 0,
          childId: expect.any(Number),
        },
      ],
    });
    expect(updates).toContainEqual({
      nodeId: 0,
      type: "root",
      childUpdates: [
        {
          op: "set",
          childIdx: 0,
          childId: expect.any(Number),
        },
      ],
    });
  });
});

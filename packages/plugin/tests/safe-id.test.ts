import fc from "fast-check";
import puppeteer from "puppeteer";
import { startServer as startTestServer } from "@pluginsdotdev/test-utils";
import { safeId } from "../src/safe-id";

import type { Browser, Page } from "puppeteer";

let browser: Browser;
let page: Page;
let shutdown: () => {};

jest.setTimeout(20000);

const port = 8080;

describe("safe-id", () => {
  beforeAll(async () => {
    shutdown = await startTestServer(port);
  });

  afterAll(async () => {
    await shutdown();
  });

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
  });

  afterEach(async () => {
    browser.close();
  });

  const prefixArb = fc.stringOf(
    fc.constantFrom("a", "b", "c", "A", "B", "C", "1", "2", "3", "_"),
    1,
    20
  );

  xit("should return a reasonable prefix", async () => {
    await fc.assert(
      fc.asyncProperty(
        prefixArb,
        fc.string(1, 20),
        async (safePrefix: string, id: string) => {
          const url = `about:blank?idPrefix=${safePrefix}`;
          await page.goto(url);
          await page.evaluate((port) => {
            const script = document.createElement("script");
            script.src = `http://localhost:${port}/dist/index.js`;
            script.type = "application/javascript";
            document.head.appendChild(script);
          }, port);
          await page.waitForFunction(() => (<any>window).index);
          const sid = await page.evaluate(
            (id) => (<any>window).index.safeId(id),
            id
          );
          expect(sid.slice(0, safePrefix.length)).toEqual(safePrefix);
          expect(sid.slice(-1 * id.length)).toEqual(id);
        }
      )
    );
  });

  xit("should error for a bad prefix", async () => {
    await fc.assert(
      fc.asyncProperty(
        prefixArb,
        fc.string(1, 20),
        async (safePrefix: string, id: string) => {
          const url = `about:blank?idPrefix=${safePrefix}${encodeURIComponent(
            '"><script src=bad>'
          )}`;
          await page.goto(url);
          await page.evaluate((port) => {
            const script = document.createElement("script");
            script.src = `http://localhost:${port}/dist/index.js`;
            script.type = "application/javascript";
            document.head.appendChild(script);
          }, port);
          await page.waitForFunction(() => (<any>window).index);
          await expect(async () => {
            await page.evaluate((id) => (<any>window).index.safeId(id), id);
          }).rejects.toThrow();
        }
      )
    );
  });
});

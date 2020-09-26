import fc from "fast-check";
import puppeteer from "puppeteer";
import { safeId } from "../src/safe-id";

import type { Browser, Page } from "puppeteer";

let browser: Browser;
let page: Page;

describe("plugin-point", () => {
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

  it("should return a reasonable prefix", async () => {
    fc.assert(
      fc.asyncProperty(
        fc.asciiString(1, 20),
        fc.string(1, 20),
        async (safePrefix: string, id: string) => {
          const url = `about:blank?idPrefix=${safePrefix}`;
          await page.goto(url);
          await page.evaluate(() => {
            const script = document.createElement("script");
            script.src = "../dist/index.js";
            script.type = "application/javascript";
            document.appendChild(script);
          });
          const sid = await page.evaluate(() => (<any>window).index.safeId(id));
          expect(sid).toMatch(new RegExp("^" + safePrefix));
          expect(sid).toMatch(new RegExp(id + "$"));
        }
      )
    );
  });
});

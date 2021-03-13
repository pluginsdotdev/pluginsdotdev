import puppeteer from "puppeteer";
import { startServer as startTestServer, Handler } from "./test-server";

import type { Browser, Page } from "puppeteer";

const browserTest = (
  ports: Array<number>,
  initialPage: string,
  handlers?: Array<Handler>
) => {
  let _browser: Browser;
  let _page: Page;
  let shutdown: () => Promise<undefined>;

  return {
    browser() {
      return _browser;
    },

    page() {
      return _page;
    },

    async beforeAll() {
      const shutdowns = await Promise.all(
        ports.map((port) => startTestServer(port, handlers))
      );

      shutdown = async () => {
        await Promise.all(shutdowns.map((shutdown) => shutdown()));
        return void 0;
      };
    },

    async afterAll() {
      return shutdown();
    },

    async beforeEach() {
      _browser = await puppeteer.launch({
        args: [
          "--disable-dev-shm-usage", // running in docker with small /dev/shm
          "--no-sandbox",
        ],
      });
      _page = await _browser.newPage();
      _page.on("console", (c) => console.log("Log from puppeteer", c.text()));
      _page.on("error", (e) => console.log("Error from puppeteer", e));
      await _page.goto(initialPage);
      // wait until our js has been loaded
      await _page.waitForFunction(() => !!(<any>window).index);
    },

    async afterEach() {
      return _browser.close();
    },
  };
};

export { browserTest };

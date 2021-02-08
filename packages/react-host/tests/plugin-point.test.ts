import { browserTest } from "@pluginsdotdev/test-utils";
import type { Page, ElementHandle } from "puppeteer";

const hostPort = 8080;
const pluginPort = 8081;

const t = browserTest(
  [hostPort, pluginPort],
  `http://localhost:${hostPort}/tests/host.html`
);

const getMainPluginDiv = async (
  page: Page,
  cls: string
): Promise<ElementHandle<HTMLDivElement>> => {
  await page.waitForFunction(
    (cls: string) =>
      document
        .querySelector("#root")
        ?.firstElementChild?.shadowRoot?.querySelector(`div.${cls}`),
    {},
    cls
  );

  return page.evaluateHandle(
    (cls: string) =>
      document
        .querySelector("#root")
        ?.firstElementChild?.shadowRoot?.querySelector(`div.${cls}`),
    cls
  ) as Promise<ElementHandle<HTMLDivElement>>;
};

describe("plugin-point", () => {
  beforeAll(t.beforeAll);

  afterAll(t.afterAll);

  beforeEach(t.beforeEach);

  afterEach(t.afterEach);

  it("basic rendering should work", async () => {
    const page = t.page();
    await page.evaluate(() => {
      window.ReactDOM.render(
        window.React.createElement((<any>window).index.PluginPoint, {
          hostId: "my-host",
          pluginPoint: "my-plugin-point",
          jwt: "fake-jwt",
          pluginUrl: "http://localhost:8081/tests/plugin.html",
          props: {
            className: "hello",
            title: "world",
          },
        }),
        document.getElementById("root")
      );
    });
    const div = await getMainPluginDiv(page, "hello");
    expect(div).toBeTruthy();
    expect(await div.$eval("p", (p) => p.innerHTML)).toEqual("world");
  });

  it("rendering updates should work", async () => {
    const page = t.page();
    await page.evaluate(() => {
      window.ReactDOM.render(
        window.React.createElement((<any>window).index.PluginPoint, {
          hostId: "my-host",
          pluginPoint: "my-plugin-point",
          jwt: "fake-jwt",
          pluginUrl: "http://localhost:8081/tests/plugin.html",
          props: {
            className: "hello",
            title: "world",
          },
        }),
        document.getElementById("root")
      );
    });
    const div = await getMainPluginDiv(page, "hello");
    expect(div).toBeTruthy();
    expect(await div.$eval("div.hello > p", (p) => p.innerHTML)).toEqual(
      "world"
    );

    await page.evaluate(() => {
      window.ReactDOM.render(
        window.React.createElement((<any>window).index.PluginPoint, {
          hostId: "my-host",
          pluginPoint: "my-plugin-point",
          jwt: "fake-jwt",
          pluginUrl: "http://localhost:8081/tests/plugin.html",
          props: {
            className: "hello2",
            title: "world!",
          },
        }),
        document.getElementById("root")
      );
    });
    const div2 = await getMainPluginDiv(page, "hello2");
    const oldDivExists = await page.evaluate(() =>
      document
        .querySelector("#root")
        ?.firstElementChild?.shadowRoot?.querySelector("div.hello")
        ? true
        : false
    );
    expect(oldDivExists).toBeFalsy();
    expect(div2).toBeTruthy();
    expect(await div2.$eval("p", (p) => p.innerHTML)).toEqual("world!");
  });

  it("plugin->host events should work", async () => {
    const page = t.page();
    await page.evaluate(() => {
      const PP = () => {
        const [count, setCount] = window.React.useState(0);

        return window.React.createElement((<any>window).index.PluginPoint, {
          hostId: "my-host",
          pluginPoint: "my-plugin-point",
          jwt: "fake-jwt",
          pluginUrl: "http://localhost:8081/tests/plugin.html",
          props: {
            className: "hello",
            title: "world",
            count: count,
            onClick: () => setCount(count + 1),
          },
        });
      };
      window.ReactDOM.render(
        window.React.createElement(PP, {}),
        document.getElementById("root")
      );
    });
    const div = await getMainPluginDiv(page, "hello");
    expect(div).toBeTruthy();
    expect(await div.$eval("p", (p) => p.innerHTML)).toEqual("world");
    expect(await div.$("button")).toBeTruthy();

    const btn = await div.$("button");
    await btn!.click();
    await page.waitForFunction(
      (div) => div.querySelector('[data-count="1"]'),
      {},
      div
    );
    expect(
      await page.evaluate((div) => div.querySelector(".count")!.innerHTML, div)
    ).toEqual("1");

    await btn!.click();
    await page.waitForFunction(
      (div) => div.querySelector('[data-count="2"]'),
      {},
      div
    );
    expect(
      await page.evaluate((div) => div.querySelector(".count")!.innerHTML, div)
    ).toEqual("2");
  });

  it("host components should work", async () => {
    const page = t.page();
    await page.evaluate(() => {
      const RD = (window as any).ReactDOM as any;
      const R = (window as any).React as any;

      const MyHostComponent = ({ pluginProp }: { pluginProp: string }) =>
        R.createElement("p", { className: "from-plugin" }, pluginProp);

      RD.render(
        R.createElement((<any>window).index.PluginPoint, {
          hostId: "my-host",
          pluginPoint: "my-plugin-point",
          jwt: "fake-jwt",
          pluginUrl: "http://localhost:8081/tests/plugin.html",
          exposedComponents: { MyHostComponent },
          props: {
            className: "hello",
            title: "world",
            renderHostComponent: true,
          },
        }),
        document.getElementById("root")
      );
    });
    const div = await getMainPluginDiv(page, "hello");
    const hostComponent = await div.$("p.from-plugin");
    expect(hostComponent).toBeTruthy();
    expect(await hostComponent!.evaluate((p: Element) => p.innerHTML)).toEqual(
      "hello world"
    );
  });

  xit("sanitizes dangerouslySetInnerHTML", async () => {
    const page = t.page();
    await page.evaluate(() => {
      const RD = (window as any).ReactDOM as any;
      const R = (window as any).React as any;

      RD.render(
        R.createElement((<any>window).index.PluginPoint, {
          hostId: "my-host",
          pluginPoint: "my-plugin-point",
          jwt: "fake-jwt",
          pluginUrl: "http://localhost:8081/tests/plugin-sanitization.html",
          props: {
            dangerouslySetInnerHTML: true,
          },
        }),
        document.getElementById("root")
      );
    });
    await page.waitForSelector("div.dangerouslySetInnerHTML");
    expect(await page.$$("div.dangerouslySetInnerHTML *")).toHaveLength(0);
  });
});

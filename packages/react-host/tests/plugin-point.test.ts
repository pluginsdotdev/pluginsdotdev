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

const baseProps = {
  hostId: "my-host",
  pluginPoint: "my-plugin-point",
  jwt: "fake-jwt",
  pluginUrl: "http://localhost:8081/tests/plugin.html",
  hostConfig: {
    scriptNonce: "abc",
    styleNonce: "xyz",
  },
};

describe("plugin-point", () => {
  beforeAll(t.beforeAll);

  afterAll(t.afterAll);

  beforeEach(t.beforeEach);

  afterEach(t.afterEach);

  it("basic rendering should work", async () => {
    const page = t.page();
    await page.evaluate((baseProps) => {
      window.ReactDOM.render(
        window.React.createElement(
          (<any>window).index.PluginPoint,
          Object.assign(
            {
              props: {
                className: "hello",
                title: "world",
              },
            },
            baseProps
          )
        ),
        document.getElementById("root")
      );
    }, baseProps);
    const div = await getMainPluginDiv(page, "hello");
    expect(div).toBeTruthy();
    expect(await div.$eval("p", (p) => p.innerHTML)).toEqual("world");
  });

  it("rendering updates should work", async () => {
    const page = t.page();
    await page.evaluate((baseProps) => {
      window.ReactDOM.render(
        window.React.createElement(
          (<any>window).index.PluginPoint,
          Object.assign(
            {
              props: {
                className: "hello",
                title: "world",
              },
            },
            baseProps
          )
        ),
        document.getElementById("root")
      );
    }, baseProps);
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
    await page.evaluate((baseProps) => {
      const PP = () => {
        const [count, setCount] = window.React.useState(0);

        return window.React.createElement(
          (<any>window).index.PluginPoint,
          Object.assign(
            {
              props: {
                className: "hello",
                title: "world",
                count: count,
                onClick: () => setCount(count + 1),
              },
            },
            baseProps
          )
        );
      };
      window.ReactDOM.render(
        window.React.createElement(PP, {}),
        document.getElementById("root")
      );
    }, baseProps);
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

  it("custom components should work", async () => {
    const page = t.page();
    await page.evaluate((baseProps) => {
      const RD = (window as any).ReactDOM as any;
      const R = (window as any).React as any;

      RD.render(
        R.createElement(
          (<any>window).index.PluginPoint,
          Object.assign(
            {
              props: {
                className: "hello",
                customElement: true,
              },
            },
            baseProps
          )
        ),
        document.getElementById("root")
      );
    }, baseProps);
    const div = await getMainPluginDiv(page, "hello");
    const myP = await div.$("p.my-p");
    expect(myP).toBeTruthy();
    expect(await myP!.evaluate((p: Element) => p.shadowRoot)).toBeTruthy();
    expect(
      await myP!.evaluate(
        (p: Element) => p.shadowRoot?.querySelector("style")?.innerHTML
      )
    ).toBeTruthy();
    expect(
      await myP!.evaluate(
        (p: Element) => p.shadowRoot?.querySelector("span")?.innerHTML
      )
    ).toBeTruthy();
  });

  it("autonomous custom components should work", async () => {
    const page = t.page();
    await page.evaluate((baseProps) => {
      const RD = (window as any).ReactDOM as any;
      const R = (window as any).React as any;

      RD.render(
        R.createElement(
          (<any>window).index.PluginPoint,
          Object.assign(
            {
              props: {
                className: "hello",
                autonomousCustomElement: true,
              },
            },
            baseProps
          )
        ),
        document.getElementById("root")
      );
    }, baseProps);
    const div = await getMainPluginDiv(page, "hello");
    const myP = await div.$("span.my-autonomous");
    expect(myP).toBeTruthy();
    expect(await myP!.evaluate((p: Element) => p.shadowRoot)).toBeTruthy();
    expect(
      await myP!.evaluate(
        (p: Element) => p.shadowRoot?.querySelector("style")?.innerHTML
      )
    ).toBeTruthy();
    expect(
      await myP!.evaluate(
        (p: Element) => p.shadowRoot?.querySelector("span")?.innerHTML
      )
    ).toBeTruthy();
  });
});

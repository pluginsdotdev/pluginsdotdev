import fs from "fs";
import { pem2jwk } from "pem-jwk";
import jwt from "jsonwebtoken";
import { browserTest } from "@pluginsdotdev/test-utils";
import type { Page, ElementHandle } from "puppeteer";

const hostId = "host";
const hostPort = 8080;
const pluginPort = 8081;
const pluginUrl = `http://localhost:${pluginPort}/tests/plugin.html`;
const kid = "123";
const userId = "user-123";
const groups = {
  "group-123": "admin",
};
const jwtString = jwt.sign(
  {
    sub: userId,
    groups,
  },
  fs.readFileSync("tests/private.pem").toString("utf8"),
  {
    algorithm: "RS256",
    audience: `localhost:${pluginPort}`,
    issuer: "plugins.dev",
    keyid: kid,
    expiresIn: "1 day",
  }
);

const jwksHandler = (pathname: string) => {
  if (pathname !== "/.well-known/jwks.json") {
    return null;
  }

  return {
    status: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      keys: [
        {
          ...pem2jwk(fs.readFileSync("tests/public.pem").toString("utf8")),
          kid,
        },
      ],
    }),
  };
};

const pluginHandler = (pathname: string) => {
  if (pathname !== "/tests/plugin.html") {
    return null;
  }

  return {
    status: 200,
    headers: {
      "Set-Cookie": `${hostId}--jwt=${jwtString}`,
    },
  };
};

const t = browserTest(
  [hostPort, pluginPort],
  `http://localhost:${hostPort}/tests/host.html`,
  [jwksHandler, pluginHandler]
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
  hostId,
  pluginPoint: "my-plugin-point",
  pluginUrl,
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

    await page.evaluate(
      (hostId: string, pluginUrl: string) => {
        window.ReactDOM.render(
          window.React.createElement((<any>window).index.PluginPoint, {
            hostId,
            pluginPoint: "my-plugin-point",
            pluginUrl,
            props: {
              className: "hello2",
              title: "world!",
            },
          }),
          document.getElementById("root")
        );
      },
      hostId,
      pluginUrl
    );
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

  it("comments are ignored", async () => {
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
                comment: true,
              },
            },
            baseProps
          )
        ),
        document.getElementById("root")
      );
    }, baseProps);
    const div = await getMainPluginDiv(page, "hello");
    await page.waitForFunction(
      (div: Element) => div.querySelector("div.comment-marker"),
      {},
      div
    );
    const c = await div.$("div.comment-marker");
    expect(c).toBeTruthy();
    expect(await c!.evaluate((c: Element) => c.childNodes.length)).toEqual(0);
  });

  it("default slot contents work", async () => {
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
                autonomousCustomElementSlot: false,
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
    expect(
      await myP!.evaluate(
        (p: Element) => p.shadowRoot?.querySelector("slot")?.innerHTML
      )
    ).toBeFalsy();
    expect(
      await myP!.evaluate(
        (p: Element) =>
          p.shadowRoot?.querySelector("p.default-content")?.textContent
      )
    ).toEqual("default");
    expect(
      await myP!.evaluate(
        (p: Element) =>
          p.shadowRoot?.querySelector("p.default-content")?.nextSibling
            ?.textContent
      )
    ).toEqual("hello autonomous world");
  });

  it("override slot contents work", async () => {
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
                autonomousCustomElementSlot: true,
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
    expect(
      await myP!.evaluate(
        (p: Element) => p.shadowRoot?.querySelector("slot")?.innerHTML
      )
    ).toBeFalsy();
    expect(
      await myP!.evaluate(
        (p: Element) =>
          p.shadowRoot?.querySelector("p.override-content")?.textContent
      )
    ).toEqual("override");
    expect(
      await myP!.evaluate(
        (p: Element) =>
          p.shadowRoot?.querySelector("p.override-content")?.nextSibling
            ?.textContent
      )
    ).toEqual("hello autonomous world");
  });
});

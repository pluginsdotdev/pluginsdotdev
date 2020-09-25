import { browserTest } from "@pluginsdotdev/test-utils";

const hostPort = 8080;
const pluginPort = 8081;

const t = browserTest(
  [hostPort, pluginPort],
  `http://localhost:${hostPort}/tests/host.html`
);

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
    await page.waitForSelector("div.hello");
    expect(await page.$("div.hello")).toBeTruthy();
    expect(await page.$eval("div.hello > p", (p) => p.innerHTML)).toEqual(
      "world"
    );
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
    await page.waitForSelector("div.hello");
    expect(await page.$("div.hello")).toBeTruthy();
    expect(await page.$eval("div.hello > p", (p) => p.innerHTML)).toEqual(
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
    await page.waitForSelector("div.hello2");
    expect(await page.$("div.hello")).toBeFalsy();
    expect(await page.$("div.hello2")).toBeTruthy();
    expect(await page.$eval("div.hello2 > p", (p) => p.innerHTML)).toEqual(
      "world!"
    );
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
    await page.waitForSelector("div.hello");
    expect(await page.$("div.hello")).toBeTruthy();
    expect(await page.$eval("div.hello > p", (p) => p.innerHTML)).toEqual(
      "world"
    );
    expect(await page.$("button")).toBeTruthy();

    await page.click("button");
    await page.waitForSelector("[data-count='1']");
    expect(
      await page.evaluate(() => document.getElementById("count")!.innerHTML)
    ).toEqual("1");

    await page.click("button");
    await page.waitForSelector("[data-count='2']");
    expect(
      await page.evaluate(() => document.getElementById("count")!.innerHTML)
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
    await page.waitForSelector("p.from-plugin");
    expect(await page.$("p.from-plugin")).toBeTruthy();
    expect(await page.$eval("p.from-plugin", (p) => p.innerHTML)).toEqual(
      "hello world"
    );
  });

  it("sanitizes dangerouslySetInnerHTML", async () => {
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

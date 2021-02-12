import fc from "fast-check";
import URL from "url";
import { fixWhitespace } from "../src/regex-utils";
import { getUnescapedCssValue, getValidStyle } from "../src/css-utils";
import { anySpaceArb, urlPathArb } from "./arbs";

describe("css-utils", () => {
  describe("getUnescapedCssValue", () => {
    it("unescapes unicode and constant encoding for ascii", () => {
      fc.assert(
        fc.property(
          fc.ascii(),
          fc.ascii().filter((s) => !/[0-9a-z]/i.test(s)),
          (codePointStr, constantStr) => {
            const codePointEscaped = codePointStr
              .split("")
              .map((s) => `\\${s.codePointAt(0)!.toString(16)} `)
              .join("");
            const constantEscaped = `\\${constantStr.split("").join("\\")}`;
            if (!!codePointStr) {
              expect(codePointEscaped).not.toEqual(codePointStr);
            }
            if (!!constantStr) {
              expect(constantEscaped).not.toEqual(constantStr);
            }
            expect(
              fixWhitespace(
                getUnescapedCssValue(codePointEscaped + constantEscaped),
                " "
              )
            ).toEqual(fixWhitespace(codePointStr + constantStr, " "));
          }
        )
      );
    });

    it("handles whitespace", () => {
      fc.assert(
        fc.property(
          anySpaceArb,
          fc.ascii(),
          anySpaceArb,
          fc.ascii(),
          anySpaceArb,
          (ws1, prefix, ws2, suffix, ws3) => {
            expect(
              getUnescapedCssValue(ws1 + prefix + ws2 + suffix + ws3)
            ).toEqual(getUnescapedCssValue(` ${prefix} ${suffix} `));
          }
        )
      );
    });
  });

  describe("getValidStyle", () => {
    const pluginDomain = "https://plugins.dev";
    const pluginUrl = "https://plugins.dev/my-plugin";

    describe("url()", () => {
      it("leaves strings without a url unchanged", () => {
        fc.assert(
          fc.property(
            fc.string().filter((s) => !/url/i.test(s)),
            (s: string) => {
              expect(
                getValidStyle(pluginDomain, pluginUrl, {}, { background: s })
              ).toMatchObject({ background: getUnescapedCssValue(s) });
            }
          )
        );
      });

      it("rejects unsafe urls", () => {
        fc.assert(
          fc.property(
            fc.string().filter((s) => !s.startsWith(pluginDomain)),
            (s: string) => {
              expect(
                getValidStyle(
                  pluginDomain,
                  pluginUrl,
                  {},
                  { background: `url(${s})` }
                )
              ).toMatchObject({});
              expect(
                getValidStyle(
                  pluginDomain,
                  pluginUrl,
                  {},
                  { background: `url("${s}")` }
                )
              ).toMatchObject({});
              expect(
                getValidStyle(
                  pluginDomain,
                  pluginUrl,
                  {},
                  { background: `url('${s}')` }
                )
              ).toMatchObject({});
            }
          )
        );
      });

      it("accepts safe absolute urls", () => {
        fc.assert(
          fc.property(urlPathArb, (path: string) => {
            const url = URL.resolve(pluginDomain, `/${path}`);
            const expected = {
              background: `url("${getUnescapedCssValue(url)}")`,
            };
            expect(
              getValidStyle(
                pluginDomain,
                pluginUrl,
                {},
                { background: `url(${url})` }
              )
            ).toMatchObject(expected);
            expect(
              getValidStyle(
                pluginDomain,
                pluginUrl,
                {},
                { background: `url("${url}")` }
              )
            ).toMatchObject(expected);
            expect(
              getValidStyle(
                pluginDomain,
                pluginUrl,
                {},
                { background: `url('${url}')` }
              )
            ).toMatchObject(expected);
          })
        );
      });

      it("accepts safe absolute urls with same ports (pluginDomain implied)", () => {
        fc.assert(
          fc.property(urlPathArb, (path: string) => {
            const url = `${pluginDomain}:443/${path}`;
            const expected = {
              background: `url("${getUnescapedCssValue(url)}")`,
            };
            expect(
              getValidStyle(
                pluginDomain,
                pluginUrl,
                {},
                { background: `url(${url})` }
              )
            ).toMatchObject(expected);
            expect(
              getValidStyle(
                pluginDomain,
                pluginUrl,
                {},
                { background: `url("${url}")` }
              )
            ).toMatchObject(expected);
            expect(
              getValidStyle(
                pluginDomain,
                pluginUrl,
                {},
                { background: `url('${url}')` }
              )
            ).toMatchObject(expected);
          })
        );
      });

      it("accepts safe absolute urls with same ports (provided implied)", () => {
        fc.assert(
          fc.property(urlPathArb, (path: string) => {
            const url = `${pluginDomain}/${path}`;
            const expected = {
              background: `url("${getUnescapedCssValue(url)}")`,
            };
            const explicitPluginDomain = `${pluginDomain}:443`;
            expect(
              getValidStyle(
                explicitPluginDomain,
                pluginUrl,
                {},
                { background: `url(${url})` }
              )
            ).toMatchObject(expected);
            expect(
              getValidStyle(
                explicitPluginDomain,
                pluginUrl,
                {},
                { background: `url("${url}")` }
              )
            ).toMatchObject(expected);
            expect(
              getValidStyle(
                explicitPluginDomain,
                pluginUrl,
                {},
                { background: `url('${url}')` }
              )
            ).toMatchObject(expected);
          })
        );
      });

      it("rejects absolute urls with different implied ports", () => {
        fc.assert(
          fc.property(urlPathArb, (path: string) => {
            const url = `${pluginDomain}:444/${path}`;
            const expected = {};

            expect(
              getValidStyle(
                pluginDomain,
                pluginUrl,
                {},
                { background: `url(${url})` }
              )
            ).toMatchObject(expected);
            expect(
              getValidStyle(
                pluginDomain,
                pluginUrl,
                {},
                { background: `url("${url}")` }
              )
            ).toMatchObject(expected);
            expect(
              getValidStyle(
                pluginDomain,
                pluginUrl,
                {},
                { background: `url('${url}')` }
              )
            ).toMatchObject(expected);
          })
        );
      });

      it("rejects absolute urls with a bad protocol", () => {
        fc.assert(
          fc.property(urlPathArb, (path: string) => {
            const url = `${pluginDomain.replace("https:", "http:")}/${path}`;
            const expected = { color: "purple" };

            expect(
              getValidStyle(
                pluginDomain,
                pluginUrl,
                {},
                { color: "purple", background: `url(${url})` }
              )
            ).toMatchObject(expected);
            expect(
              getValidStyle(
                pluginDomain,
                pluginUrl,
                {},
                { color: "purple", background: `url("${url}")` }
              )
            ).toMatchObject(expected);
            expect(
              getValidStyle(
                pluginDomain,
                pluginUrl,
                {},
                { color: "purple", background: `url('${url}')` }
              )
            ).toMatchObject(expected);
          })
        );
      });

      it("accepts safe relative urls", () => {
        fc.assert(
          fc.property(urlPathArb, (path: string) => {
            const url = URL.resolve(pluginUrl, path);
            const expected = {
              background: `url("${getUnescapedCssValue(url)}")`,
            };
            expect(
              getValidStyle(
                pluginDomain,
                pluginUrl,
                {},
                { background: `url(${path})` }
              )
            ).toMatchObject(expected);
            expect(
              getValidStyle(
                pluginDomain,
                pluginUrl,
                {},
                { background: `url("${path}")` }
              )
            ).toMatchObject(expected);
            expect(
              getValidStyle(
                pluginDomain,
                pluginUrl,
                {},
                { background: `url('${path}')` }
              )
            ).toMatchObject(expected);
          })
        );
      });
    });

    it("rejects images and elements", () => {
      fc.assert(
        fc.property(
          fc.string().filter((s) => !/['"\/))]/.test(s)),
          (s: string) => {
            expect(
              getValidStyle(
                pluginDomain,
                pluginUrl,
                {},
                {
                  background: `image(${s})`,
                  content: `element(${s})`,
                  color: "red",
                }
              )
            ).toMatchObject({ color: "red" });
            expect(
              getValidStyle(
                pluginDomain,
                pluginUrl,
                {},
                {
                  background: `image("${s}")`,
                  content: `element("${s}")`,
                  color: "red",
                }
              )
            ).toMatchObject({ color: "red" });
            expect(
              getValidStyle(
                pluginDomain,
                pluginUrl,
                {},
                {
                  background: `image('${s}')`,
                  content: `element('${s}')`,
                  color: "red",
                }
              )
            ).toMatchObject({ color: "red" });
          }
        )
      );
    });
  });
});

import fc from "fast-check";
import { cssSelectorArb, cssStyleRuleArb } from "./arbs";
import { getStyleSanitizers } from "../src/style-sanitizers";
import { getUnescapedCssValue } from "../src/css-utils";

const pluginDomain = "https://plugins.dev";
const pluginUrl = "https://plugins.dev/my-plugin";
const rootSanitizers = getStyleSanitizers({
  pluginDomain,
  pluginUrl,
  allowedStyleValues: {},
  isPluginRoot: true,
});
const nonRootSanitizers = getStyleSanitizers({
  pluginDomain,
  pluginUrl,
  allowedStyleValues: {},
  isPluginRoot: false,
});

const forRootAndNon = (test: (sanitizers: typeof rootSanitizers) => void) => {
  test(rootSanitizers);
  test(nonRootSanitizers);
};

describe("style-sanitizers", () => {
  describe("getStyleSanitizers", () => {
    describe("selector", () => {
      it("allows good selectors", () => {
        fc.assert(
          fc.property(cssSelectorArb, (selector) => {
            const { styleRuleSanitizer } = nonRootSanitizers;
            expect(styleRuleSanitizer.selector(selector)).toEqual(
              getUnescapedCssValue(selector)
            );

            const { styleRuleSanitizer: rootSanitizer } = rootSanitizers;
            if (/:host/.test(selector)) {
              expect(() => {
                rootSanitizer.selector(selector);
              }).toThrow();
            } else {
              expect(rootSanitizer.selector(selector)).toEqual(
                getUnescapedCssValue(selector)
              );
            }
          })
        );
      });

      it("prevents rules in selectors", () => {
        fc.assert(
          fc.property(cssStyleRuleArb, (styleRule) => {
            forRootAndNon(({ styleRuleSanitizer }) => {
              expect(() => {
                styleRuleSanitizer.selector(styleRule);
              }).toThrow();
            });
          })
        );
      });
    });
  });
});

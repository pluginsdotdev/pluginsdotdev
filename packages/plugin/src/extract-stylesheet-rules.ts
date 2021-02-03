export type Style = Record<string, string>;

export interface AtRule<Id extends string> {
  atId: Id;
}

export interface GroupingRule {
  rules: Array<Rule>;
}

export interface ConditionRule extends GroupingRule {
  condition: string;
}

export interface StyleRule {
  selector: string;
  style: Style;
}

export type SupportsRule = AtRule<"supports"> & ConditionRule;

export type PageRule = AtRule<"page"> &
  StyleRule & {
    selector: string;
  };

export type NamespaceRule = AtRule<"namespace"> & {
  namespaceURI: string;
  prefix: string;
};

export type MediaRule = AtRule<"media"> & ConditionRule;

export type FrameStyles = Record<string, Style>;

export type KeyframesRule = AtRule<"keyframes"> & {
  frames: FrameStyles;
};

export type FontRule = AtRule<"font-face"> & {
  style: Style;
};

export type ImportRule = GroupingRule & {
  media: Array<string>;
};

export type Rule =
  | StyleRule
  | SupportsRule
  | PageRule
  | NamespaceRule
  | MediaRule
  | KeyframesRule
  | FontRule
  | ImportRule;

export interface StyleSheetRules {
  rules: Array<Rule>;
}

const { map, reduce } = Array.prototype;

const convertStyle = (cssStyle: CSSStyleDeclaration): Style =>
  reduce.call<
    CSSStyleDeclaration,
    [(style: Style, styleName: string) => Style, Style],
    Style
  >(
    cssStyle,
    (style: Style, styleName: string): Style => ({
      ...style,
      [styleName]: cssStyle.getPropertyValue(styleName),
    }),
    {} as Style
  ) as Style;

const convertSupportsRule = (cssRule: CSSSupportsRule): SupportsRule => ({
  atId: "supports",
  condition: cssRule.conditionText,
  rules: map.call(cssRule.cssRules, convertRule) as Array<Rule>,
});

const convertPageRule = (cssRule: CSSPageRule): PageRule => ({
  atId: "page",
  selector: cssRule.selectorText,
  style: convertStyle(cssRule.style),
});

const convertNamespaceRule = (cssRule: CSSNamespaceRule): NamespaceRule => ({
  atId: "namespace",
  namespaceURI: cssRule.namespaceURI,
  prefix: cssRule.prefix,
});

const convertMediaRule = (cssRule: CSSMediaRule): MediaRule => ({
  atId: "media",
  condition: cssRule.conditionText,
  rules: map
    .call<CSSRuleList, [(cssRule: CSSRule) => Rule | null], Array<Rule | null>>(
      cssRule.cssRules,
      convertRule
    )
    .filter(ruleFilter),
});

const convertKeyframesRule = (cssRule: CSSKeyframesRule): KeyframesRule => ({
  atId: "keyframes",
  frames: reduce.call<
    CSSRuleList,
    [(frames: FrameStyles, rule: CSSKeyframeRule) => FrameStyles, FrameStyles],
    FrameStyles
  >(
    cssRule.cssRules,
    (frames: FrameStyles, rule: CSSKeyframeRule): FrameStyles => ({
      ...frames,
      [rule.keyText]: convertStyle(rule.style),
    }),
    {} as FrameStyles
  ),
});

const convertFontFaceRule = (cssRule: CSSFontFaceRule): FontRule => ({
  atId: "font-face",
  style: convertStyle(cssRule.style),
});

const convertImportRule = (cssRule: CSSImportRule): ImportRule => ({
  media: map.call<MediaList, [(m: string) => string], Array<string>>(
    cssRule.media,
    (m) => m
  ),
  rules: map
    .call<CSSRuleList, [typeof convertRule], Array<Rule | null>>(
      cssRule.styleSheet.cssRules,
      convertRule
    )
    .filter(ruleFilter),
});

const convertStyleRule = (cssRule: CSSStyleRule): StyleRule => ({
  selector: cssRule.selectorText,
  style: convertStyle(cssRule.style),
});

const convertRule = (cssRule: CSSRule): Rule | null => {
  if (cssRule instanceof CSSSupportsRule) {
    return convertSupportsRule(cssRule);
  } else if (cssRule instanceof CSSPageRule) {
    return convertPageRule(cssRule);
  } else if (cssRule instanceof CSSNamespaceRule) {
    return convertNamespaceRule(cssRule);
  } else if (cssRule instanceof CSSKeyframesRule) {
    return convertKeyframesRule(cssRule);
  } else if (cssRule instanceof CSSFontFaceRule) {
    return convertFontFaceRule(cssRule);
  } else if (cssRule instanceof CSSImportRule) {
    return convertImportRule(cssRule);
  } else if (cssRule instanceof CSSStyleRule) {
    return convertStyleRule(cssRule);
  }

  return null;
};

const ruleFilter = (rule: Rule | null): rule is Rule => !!rule;

export const extractStylesheetRules = (
  stylesheet: CSSStyleSheet
): StyleSheetRules => {
  return {
    rules: Array.prototype.map
      .call<CSSRuleList, [(rule: CSSRule) => Rule | null], Array<Rule | null>>(
        stylesheet.cssRules,
        convertRule
      )
      .filter(ruleFilter),
  };
};

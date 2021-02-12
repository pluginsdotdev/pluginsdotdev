import { fixWhitespace } from "./regex-utils";
import { domainFromUrl, resolveUrl, canonicalizeDomain } from "./domain-utils";

export type AllowedStyleValues = Record<string, Array<string>>;

/**
 * CSS allows \hex-encoded-unicode (+ trailing space) and \constant encoding.
 *
 * e.g. "\97 " === "a" and "\#" === "#"
 **/
export const getUnescapedCssValue = (value: string) =>
  fixWhitespace(value, " ")
    .replace(/\\[0-9a-f]{1,6}(?:\s|(?=[^0-9a-f])|$)/gi, (c) =>
      String.fromCodePoint(parseInt(c.slice(1).trim(), 16))
    )
    .replace(/\\./g, (c) => c.slice(1));

const sanitizeCSSUrlString = (
  pluginDomain: string,
  pluginUrl: string,
  urlString: string
) => {
  const url = resolveUrl(pluginUrl, urlString);
  const domain = domainFromUrl(url);
  if (domain !== canonicalizeDomain(pluginDomain)) {
    throw new Error("Bad domain");
  }
  return url;
};

/**
 * url(...)
 * Return a sanitized value or throw if the value is evil
 *
 * https://developer.mozilla.org/en-US/docs/Web/CSS/url
 **/
const sanitizeCSSUrls = (
  pluginDomain: string,
  pluginUrl: string,
  value: string
) =>
  value.replace(/url\s*\(\s*(['"]?)(.*?)\1\s*\)/gi, (urlContainingString) => {
    const firstParen = urlContainingString.indexOf("(");
    const lastParen = urlContainingString.lastIndexOf(")");
    const quotedUrl = urlContainingString.slice(firstParen + 1, lastParen);
    const firstSingleQuote = quotedUrl.indexOf("'");
    const firstDoubleQuote = quotedUrl.indexOf('"');
    const firstQuote = Math.min.apply(
      null,
      [quotedUrl.indexOf("'"), quotedUrl.indexOf('"')].filter((x) => x >= 0)
    );
    const quote = firstQuote >= 0 ? quotedUrl[firstQuote] : null;
    const lastQuote = quote ? quotedUrl.lastIndexOf(quote) : -1;
    const unquotedUrl =
      firstQuote >= 0 && lastQuote >= 0
        ? quotedUrl.slice(firstQuote + 1, lastQuote)
        : quotedUrl;
    const url = sanitizeCSSUrlString(pluginDomain, pluginUrl, unquotedUrl);
    return `url("${url}")`;
  });

/**
 * image-set(...)
 * Return a sanitized value or throw if the value is evil
 *
 * https://developer.mozilla.org/en-US/docs/Web/CSS/image-set
 **/
const sanitizeCSSImageSets = (
  pluginDomain: string,
  pluginUrl: string,
  value: string
) =>
  value.replace(/image-set\s*\(\s*(.*?)\s*\)/gi, (imageSetContainingString) => {
    const imgSet = imageSetContainingString.slice(
      imageSetContainingString.indexOf("(") + 1,
      imageSetContainingString.lastIndexOf(")")
    );
    const matcher = /\s*(['"]?)(.*?)\1([^,]*)[,]?/gi;
    const sanitizedImgSet = [];
    for (
      let maxIter = 20, match = matcher.exec(imgSet);
      match !== null && !!maxIter;
      match = matcher.exec(imgSet), --maxIter
    ) {
      if (match.index === imgSet.length) {
        // we're matching empty strings at the end
        break;
      }

      const [_fullMatch, _quote, url, resolution] = match;
      const trimmedUrl = url.trim();

      if (!trimmedUrl.length) {
        // we fall into this if we don't have a quoted string
        // make sure that means that we have a url(...) in resolution
        if (!/(?:url|image)\s*\(/i.test(resolution)) {
          throw new Error("Malformatted image-set");
        }

        sanitizedImgSet.push(resolution);
        continue;
      }

      const sanitizedUrl = sanitizeCSSUrlString(pluginDomain, pluginUrl, url);
      sanitizedImgSet.push(`url("${sanitizedUrl}") ${resolution.trim()}`);
    }

    return `image-set(${sanitizedImgSet.join(",")})`;
  });

/**
 * image(...)
 * No browser supports them yet so neither will we.
 *
 * https://developer.mozilla.org/en-US/docs/Web/CSS/imagefunction
 **/
const sanitizeCSSImages = (
  pluginDomain: string,
  pluginUrl: string,
  value: string
) => {
  if (/image\s*\(/gi.test(value)) {
    throw new Error("CSS image() functions are not supported");
  }

  return value;
};

/**
 * element(...)
 * No browser supports them yet so neither will we.
 *
 * https://developer.mozilla.org/en-US/docs/Web/CSS/element
 **/
const sanitizeCSSElements = (
  pluginDomain: string,
  pluginUrl: string,
  value: string
) => {
  if (/element\s*\(/gi.test(value)) {
    throw new Error("CSS element() functions are not supported");
  }

  return value;
};

const cssSanitizers = [
  sanitizeCSSUrls,
  sanitizeCSSImageSets,
  sanitizeCSSImages,
  sanitizeCSSElements,
];

const isValidStyleProp = (styleProp: string) => /^[\w\-]+$/.test(styleProp);

export const getValidStyle = (
  pluginDomain: string,
  pluginUrl: string,
  allowedStyleValues: AllowedStyleValues,
  style: Record<string, any>
) =>
  Object.keys(style).reduce((s, key) => {
    const val = style[key];
    const unescapedKey = getUnescapedCssValue(key);

    if (!isValidStyleProp(unescapedKey)) {
      return s;
    }

    if (typeof val === "number" || typeof val === "boolean") {
      // numbers and bools are ok
      s[unescapedKey] = val;
      return s;
    }

    if (typeof val !== "string") {
      // anything other than strings, numbers, and bools are out
      return s;
    }

    try {
      const valStr = "" + val;
      const unescapedVal = getUnescapedCssValue(valStr);
      const sanitizedValue = cssSanitizers.reduce(
        (value, sanitize) => sanitize(pluginDomain, pluginUrl, value),
        unescapedVal
      );

      const allowedValsForProp = allowedStyleValues[unescapedKey.toLowerCase()];
      if (
        allowedValsForProp &&
        allowedValsForProp.indexOf(sanitizedValue) < 0
      ) {
        return s;
      }

      s[unescapedKey] = sanitizedValue;
      return s;
    } catch (err) {
      return s;
    }
  }, {} as Record<string, any>);

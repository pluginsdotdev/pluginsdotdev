import { murmur2 } from "murmurhash-js";
import * as attrs from "./attrs";
import { domainFromUrl, resolveUrl } from "./domain-utils";

type HostId = string;

// from https://github.com/cure53/DOMPurify/blob/main/src/regexp.js
const isValidDataAttr = (prop: string) =>
  /^data-[\-\w.\u00B7-\uFFFF]/i.test(prop);
const isValidAriaAttr = (prop: string) => /^aria-[\-\w]+$/i.test(prop);
const fixWhitespace = (value: string, replacement?: string) =>
  value.replace(
    /[\u0000-\u0020\u00A0\u1680\u180E\u2000-\u2029\u205F\u3000]/g,
    replacement ?? ""
  );
const isAllowedUri = (value: string) =>
  /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|cid|xmpp):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i.test(
    fixWhitespace(value)
  );
const isScriptOrData = (value: string) =>
  /^(?:\w+script|data):/i.test(fixWhitespace(value));

const reactAttrs = new Set(["className", "key"]);
const allowedAttrs = new Set(
  attrs.html
    .concat(attrs.svg)
    .concat(attrs.mathMl)
    .concat(attrs.xml)
    .concat(Array.from(reactAttrs).map((a) => a.toLowerCase()))
);

const uriSafeAttrs = new Set([
  "alt",
  "class",
  "for",
  "id",
  "label",
  "name",
  "pattern",
  "placeholder",
  "summary",
  "title",
  "value",
  "style",
  "xmlns",
]);

const dataUriTags = new Set([
  "audio",
  "video",
  "img",
  "source",
  "image",
  "track",
]);

const dataUriAttrs = new Set(["src", "xlink:href", "href"]);

const anyDomainSafeAttrs = new Set(["xlink:href", "href"]);

const isEventHandler = (prop: string, value: any) =>
  /^on.*/.test(prop) && typeof value === "function";

const generateSafePrefix = () =>
  `__pluginsdotdev__${Math.floor(Math.random() * 10e10)}_`;

let _safePrefix: null | string = null;

/**
 * We prevent DOM Clobbering attacks by requiring that every id or name
 * is prefixed with a safe prefix that we control, ensuring that it can't
 * overwrite anything on the window.
 **/
export const safePrefix = (pluginPoint: string, pluginDomain: string) => {
  const hash = murmur2(`${pluginPoint}!${pluginDomain}`);
  if (_safePrefix) {
    return `${_safePrefix}${hash}__`;
  }
  _safePrefix = generateSafePrefix();
  return `${_safePrefix}${hash}__`;
};

// TODO: pull this into a shared library
const handleError = (msg: object) => {
  if (process.env.NODE_ENV !== "production") {
    console.error(msg);
    return;
  }

  // TODO: log error remotely
};

const unsafeProps = new Set<string>(["dangerouslySetInnerHTML", "is"]);

type Validator = (
  hostId: HostId,
  pluginPoint: string,
  pluginDomain: string,
  value: any,
  prop: string
) => null | { msg: string; prop: string; hostId: HostId; pluginDomain: string };

/**
 * Handles DOM Clobbering.
 * https://github.com/cure53/DOMPurify/blob/main/src/purify.js#L654
 **/
const requireSafePrefix: Validator = (
  hostId,
  pluginPoint,
  pluginDomain,
  value,
  prop
) => {
  const strValue = "" + value;
  if (!strValue.startsWith(safePrefix(pluginPoint, pluginDomain))) {
    return {
      msg: "Plugin attempted to use unsanitized id or name",
      prop,
      hostId,
      pluginDomain,
    };
  }

  return null;
};

/**
 * Validator to run for a given property
 **/
const validatorByProp: Record<string, Validator> = {
  id: requireSafePrefix,
  name: requireSafePrefix,
};

const isValidReactAttribute = (prop: string, value: any) =>
  isEventHandler(prop, value) || reactAttrs.has(prop);

/**
 * CSS allows \hex-encoded-unicode (+ trailing space) and \constant encoding.
 *
 * e.g. "\97 " === "a" and "\#" === "#"
 **/
const getUnescapedCssValue = (value: string) =>
  fixWhitespace(value, " ")
    .replace(/\\[0-9a-z]+\s/gi, (c) =>
      String.fromCodePoint(parseInt(c.slice(1, -1), 16))
    )
    .replace(/\\[^\\]/g, (c) => c.slice(1));

const sanitizeCSSUrlString = (
  pluginDomain: string,
  pluginUrl: string,
  urlString: string
) => {
  const url = resolveUrl(pluginUrl, urlString);
  const domain = domainFromUrl(url);
  if (domain !== pluginDomain) {
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

const getValidStyle = (
  pluginDomain: string,
  pluginUrl: string,
  allowedStyleValues: AllowedStyleValues,
  style: Record<string, any>
) =>
  Object.keys(style).reduce((s, key) => {
    const val = style[key];
    const unescapedKey = getUnescapedCssValue(key);

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

const getValidAttributeValue = (
  pluginDomain: string,
  pluginUrl: string,
  allowedStyleValues: AllowedStyleValues,
  tagName: string,
  prop: string,
  value: any
): any | null => {
  // adapted from https://github.com/cure53/DOMPurify/blob/main/src/purify.js#L757

  const lcTag = tagName.toLowerCase();
  const lcProp = prop.toLowerCase();

  if (prop === "style") {
    // this is in addition to dompurify
    return getValidStyle(pluginDomain, pluginUrl, allowedStyleValues, value);
  } else if (isValidDataAttr(lcProp)) {
    return value;
  } else if (isValidAriaAttr(lcProp)) {
    return value;
  } else if (!allowedAttrs.has(lcProp)) {
    // DOMPurify returns false here but we add react exclusions
    return isValidReactAttribute(prop, value) ? value : null;
  } else if (uriSafeAttrs.has(lcProp)) {
    return value;
  } else if (isAllowedUri(value)) {
    // DOMPurify returns true here but we check domains
    if (!dataUriAttrs.has(lcProp)) {
      // skip domain check
      return value;
    }

    if (anyDomainSafeAttrs.has(lcProp)) {
      // some attrs can have any domain
      return value;
    }

    const url = resolveUrl(pluginUrl, value);
    const domain = domainFromUrl(url);
    return domain === pluginDomain ? url : null;
  } else if (
    dataUriAttrs.has(lcProp) &&
    value.indexOf("data:") === 0 &&
    dataUriTags.has(lcTag)
  ) {
    return value;
    // we intentionally skip the unknown protocols check
  } else if (!value) {
    return value;
  }

  // DOMPurify returns false here but we add react exclusions
  return isValidReactAttribute(prop, value) ? value : null;
};

type AllowedStyleValues = Record<string, Array<string>>;
type RequiredPropsForTag = Record<string, Record<string, any>>;

/**
 * Parameter for sanitizeProps
 **/
export interface SanitizePropsParams {
  hostId: HostId;
  pluginPoint: string;
  pluginDomain: string;
  pluginUrl: string;
  tagName: string;
  /**
   * Map from lower-case style property to an array of permissible values
   * for it.
   * If a value is provided for a property, we perform the default style
   * sanitization and then only allow values from the array.
   * If no value is provided for a property, only the default style
   * sanitization is applied.
   **/
  allowedStyleValues?: AllowedStyleValues;
  /**
   * If provided, any lower-case tag in the key set will automatically have
   * the provided properties and values applied.
   **/
  requiredPropsForTag?: RequiredPropsForTag;
  props: Record<string, any>;
}

/**
 * Sanitize properties we intend to add to html elements.
 *
 * Follow the pattern of
 * https://github.com/cure53/DOMPurify/blob/main/src/purify.js#L743
 **/
export const sanitizeProps = ({
  hostId,
  pluginPoint,
  pluginDomain,
  pluginUrl,
  tagName,
  allowedStyleValues,
  requiredPropsForTag,
  props,
}: SanitizePropsParams) => {
  const sanitizedProps = Object.keys(props).reduce((ps, prop) => {
    const value = props[prop];

    if (unsafeProps.has(prop)) {
      handleError({
        msg: "Plugin attempted to set unsafe prop",
        prop,
        hostId,
        pluginDomain,
      });
      return ps;
    }

    const validator = validatorByProp[prop];
    if (validator) {
      const error = validator(hostId, pluginPoint, pluginDomain, value, prop);
      if (error) {
        handleError(error);
        return ps;
      }
    }

    const validAttributeValue = getValidAttributeValue(
      pluginDomain,
      pluginUrl,
      allowedStyleValues ?? ({} as AllowedStyleValues),
      tagName,
      prop,
      value
    );
    if (validAttributeValue === null) {
      return ps;
    }

    ps[prop] = validAttributeValue;
    return ps;
  }, {} as Record<string, any>);

  if (requiredPropsForTag) {
    const reqProps = requiredPropsForTag[tagName.toLowerCase()];
    if (reqProps) {
      return {
        ...sanitizedProps,
        ...reqProps,
      };
    }
  }

  return sanitizedProps;
};

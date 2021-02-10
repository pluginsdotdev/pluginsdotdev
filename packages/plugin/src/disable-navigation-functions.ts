import u from "url";
import { browserData } from "./browser-data";

const { open } = window;

let allowedDomains: Array<string> | null = null;
browserData().then((bd) => {
  allowedDomains = bd.allowedDomains;
});

/**
 * openWindow is a replacement for window.open.
 * window.open is unavailable to plugin code.
 * Only urls for allowed domains will work.
 **/
window.open = (url, name, features) => {
  if (!allowedDomains || !url) {
    return null;
  }

  const { hostname } = u.parse(url);
  if (!hostname) {
    return null;
  }

  const matches = allowedDomains.some(
    (domain) =>
      hostname === domain ||
      (domain.indexOf("*") === 0 && hostname.endsWith(domain.slice(1)))
  );
  if (!matches) {
    return null;
  }

  return open(url, "_blank", features);
};

export const disableNavigationFunctions = () => {
  const nop = () => {};
  const anyWin = window as any;
  anyWin.showModalDialog = nop;
  anyWin.showModelessDialog = nop;
  anyWin.navigate = nop;
};
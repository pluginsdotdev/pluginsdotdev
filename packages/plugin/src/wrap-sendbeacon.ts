import { browserData } from "./browser-data";
import { urlAllowed } from "./url-allowed";

const { sendBeacon } = navigator;

let allowedDomains: Array<string> = [];
browserData().then((bd) => {
  allowedDomains = bd.allowedDomains;
});

export const wrapSendBeacon = () => {
  navigator.sendBeacon = function (url, data) {
    return urlAllowed(allowedDomains, url)
      ? sendBeacon.call(navigator, url, data)
      : false;
  };
};

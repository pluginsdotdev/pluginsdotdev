import { browserData } from "./browser-data";
import { urlAllowed } from "./url-allowed";

const { open } = XMLHttpRequest.prototype;

export const wrapXMLHttpRequest = async () => {
  XMLHttpRequest.prototype.open = function (
    method: string,
    url: string,
    isAsync?: boolean,
    user?: string | null,
    password?: string | null
  ): void {
    browserData().then(({ allowedDomains }) => {
      if (!urlAllowed(allowedDomains, url)) {
        throw new Error("Attempted to access blocked domain");
      }

      open.call(this, method, url, isAsync !== false, user, password);
    });
  };
};

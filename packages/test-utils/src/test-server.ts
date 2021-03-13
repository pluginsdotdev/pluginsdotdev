import * as fs from "fs";
import * as url from "url";
import * as http from "http";
import * as path from "path";

import { OutgoingHttpHeaders } from "http";

/**
 * If a {@link Handler} returns a HandlerResult without a body,
 * the status and headers will be used and the body will be rendered
 * from a static file.
 **/
export type HandlerResult = {
  status: number;
  headers: OutgoingHttpHeaders;
  body?: string;
};
export type Handler = (pathname: string) => HandlerResult | null | undefined;

const startServer = (
  port: number,
  handlers?: Array<Handler>
): Promise<() => Promise<undefined>> =>
  new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (!req.url || req.method !== "GET") {
        res.writeHead(404);
        res.end();
        return;
      }

      const { pathname } = url.parse(req.url);

      if (!pathname) {
        res.writeHead(404);
        res.end();
        return;
      }

      const fsPath = path.normalize(path.join(process.cwd(), pathname));

      if (!fsPath.startsWith(process.cwd())) {
        res.writeHead(500);
        res.end();
        return;
      }

      const result = (handlers || []).reduce(
        (prev, handler) => prev || handler(pathname),
        null as HandlerResult | null | undefined
      );

      if (result) {
        res.writeHead(result.status, result.headers);
        if (result.body) {
          res.write(result.body);
          res.end();
          return;
        }
      } else {
        res.writeHead(200);
      }

      fs.createReadStream(fsPath, "UTF-8").pipe(res);
    });
    server.listen({ port }, (err: Error) => {
      err
        ? reject(err)
        : resolve(
            () =>
              new Promise((innerResolve, innerReject) => {
                server.close((err) => (err ? innerReject(err) : innerResolve));
              })
          );
    });
  });

export { startServer };

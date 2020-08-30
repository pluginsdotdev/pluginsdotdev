import * as fs from "fs";
import * as url from "url";
import * as http from "http";
import * as path from "path";

const startServer = (port: number): Promise<() => Promise<undefined>> =>
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

      res.writeHead(200, { "Content-Type": "..." });
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

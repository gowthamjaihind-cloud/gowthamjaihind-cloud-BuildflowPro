import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.DEMO_DIR || resolve(HERE, "../../dist-demo");
const MIME = { ".html":"text/html", ".js":"text/javascript", ".mjs":"text/javascript", ".css":"text/css", ".json":"application/json", ".svg":"image/svg+xml", ".png":"image/png", ".webmanifest":"application/manifest+json", ".woff2":"font/woff2" };
createServer((req,res)=>{
  let p = decodeURIComponent(req.url.split("?")[0]);
  let f = join(ROOT, p);
  if (!existsSync(f) || statSync(f).isDirectory()) f = join(ROOT, "index.html"); // SPA fallback
  res.writeHead(200, { "Content-Type": MIME[extname(f)] || "application/octet-stream", "Cache-Control": "no-store" });
  res.end(readFileSync(f));
}).listen(4173, () => console.log("serving dist-demo on 4173"));

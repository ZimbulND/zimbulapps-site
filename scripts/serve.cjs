// Dependency-free development server for the imported static website.
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const publicRoots = new Set([
  "index.html", "styles.css", "legal.css", "contact.js", "contact",
  "privacy", "refund-policy", "terms", "job-profit-workbook",
]);
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".exe": "application/octet-stream",
};

http.createServer(async (req, res) => {
  const respond = (status, message) => {
    res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
    res.end(req.method === "HEAD" ? undefined : message);
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    if (req.method === "POST" && ["/", "/contact/received/"].includes(req.url.split("?")[0])) {
      res.writeHead(405, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end('<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Message not sent | Zimbul Apps</title><link rel="stylesheet" href="/styles.css"><main class="contact-result container"><h1>Message not sent</h1><p>This development preview does not process or deliver contact messages. Nothing was sent to Netlify or an inbox.</p><p>Use your browser’s Back button to return to your entries, or <a href="/#contact">return to contact</a>. You can email <a href="mailto:contact@zimbulapps.com">contact@zimbulapps.com</a> from your own email app.</p></main></html>');
    }
    return respond(405, "This static preview cannot process form submissions.");
  }
  try {
    const url = new URL(req.url, "http://static.invalid");
    const pathname = decodeURIComponent(url.pathname);
    const parts = pathname.split("/").filter(Boolean);
    if (parts.some(part => part.startsWith(".") || part.includes("\\") || part.includes("\0"))) {
      return respond(404, "Not found");
    }
    if (parts.length && !publicRoots.has(parts[0])) return respond(404, "Not found");
    let file = path.join(root, ...parts);
    let stat = await fs.promises.stat(file);
    if (stat.isDirectory()) {
      if (!pathname.endsWith("/")) {
        res.writeHead(301, { Location: `${url.pathname}/${url.search}` });
        return res.end();
      }
      file = path.join(file, "index.html");
      stat = await fs.promises.stat(file);
    }
    const resolved = await fs.promises.realpath(file);
    if (!resolved.startsWith(root + path.sep) || !stat.isFile()) return respond(404, "Not found");
    res.setHeader("Content-Type", mimeTypes[path.extname(file)] || "application/octet-stream");
    res.setHeader("Content-Length", stat.size);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    if (parts[1] === "app-sandbox") res.setHeader("X-Robots-Tag", "noindex, nofollow");
    if (pathname === "/job-profit-workbook/JobProfitWorkbookSetup.exe") {
      res.setHeader("Content-Disposition", 'attachment; filename="JobProfitWorkbookSetup.exe"');
    }
    res.writeHead(200);
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).on("error", () => res.destroy()).pipe(res);
  } catch (error) {
    if (error instanceof URIError) return respond(400, "Invalid URL");
    if (error.code === "ENOENT" || error.code === "ENOTDIR") return respond(404, "Not found");
    console.error(error);
    respond(500, "Unable to serve this file");
  }
}).listen(5000, "0.0.0.0", () => {
  console.log("Static website listening on 0.0.0.0:5000");
});

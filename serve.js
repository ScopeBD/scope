/* ============================================================
   Local static server for the SCOPE site + admin panel.

     node serve.js            -> http://127.0.0.1:8000
     node serve.js 3000       -> http://127.0.0.1:3000

   Why this exists: the admin panel uses native ES modules, which
   browsers refuse to load over file:// (CORS). Opening admin/*.html
   by double-clicking gives a blank page with a console error. It has
   to be served over HTTP.

   Node's built-in modules only — no install step, no dependencies.
   This is for local development, not production.
   ============================================================ */

const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.argv[2]) || 8000;
const HOST = '127.0.0.1';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

function send(res, status, body, type) {
  res.writeHead(status, {
    'Content-Type': type || 'text/plain; charset=utf-8',
    /* Never cache during development — otherwise a CSS or JS edit
       appears not to take effect and you chase a phantom bug. */
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(req.url.split('?')[0]);
  } catch {
    return send(res, 400, 'Bad request');
  }

  if (urlPath.endsWith('/')) urlPath += 'index.html';

  const file = path.join(ROOT, urlPath);

  /* Refuse anything that escapes the project directory. */
  const rel = path.relative(ROOT, file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return send(res, 403, 'Forbidden');
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      const fallback = path.join(ROOT, '404.html');
      if (fs.existsSync(fallback)) {
        return send(res, 404, fs.readFileSync(fallback), TYPES['.html']);
      }
      return send(res, 404, 'Not found');
    }
    send(res, 200, data, TYPES[path.extname(file).toLowerCase()]);
  });
}).listen(PORT, HOST, () => {
  console.log(`Serving ${ROOT}`);
  console.log(`  site   http://${HOST}:${PORT}/`);
  console.log(`  admin  http://${HOST}:${PORT}/admin/login.html`);
  console.log('Ctrl+C to stop.');
});

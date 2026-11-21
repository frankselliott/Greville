// Minimal static server that mounts the repository root under /Greville/ (as GitHub Pages does for this project site).
// Usage: node visual/tests/serve.cjs [port]   — used by the e2e suite; no external dependencies.
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..'); const PREFIX = '/Greville/';
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.txt': 'text/plain', '.gz': 'application/gzip' };
function start(port = 0) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (!u.startsWith(PREFIX)) { res.writeHead(404); return res.end('outside /Greville/'); }
      let p = path.join(ROOT, u.slice(PREFIX.length)); if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
      if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
      if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(p).pipe(res);
    });
    srv.listen(port, '127.0.0.1', () => resolve(srv));
  });
}
module.exports = { start };
if (require.main === module) start(+process.argv[2] || 8766).then(s => console.log('serving', ROOT, 'at http://127.0.0.1:' + s.address().port + PREFIX));

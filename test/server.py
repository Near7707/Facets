"""Tiny fake SillyTavern server for trying Facets without a real install.

Usage:  python3 test/server.py [port] [path-to-SillyTavern/public]
Then open http://localhost:8123/  (options: ?theme=light  ?lang=ko  ?nochat=1)

It serves the extension at /scripts/extensions/third-party/Facets/ and fakes the
few endpoints Facets uses: /api/images/upload, /api/images/delete, /thumbnail.
Uploaded files go to test/_data/ (deleted when the server starts).
"""
import base64, hashlib, json, os, shutil, sys, urllib.parse
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
DATA = os.path.join(HERE, '_data')
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
ST_PUBLIC = sys.argv[2] if len(sys.argv) > 2 else os.environ.get('ST_PUBLIC', '')
EXT_PREFIX = '/scripts/extensions/third-party/Facets/'

shutil.rmtree(DATA, ignore_errors=True)
os.makedirs(os.path.join(DATA, 'user', 'images'), exist_ok=True)


def avatar_svg(name):
    h = hashlib.md5(name.encode()).hexdigest()
    hue = int(h[:2], 16) * 360 // 255
    letter = (os.path.splitext(name)[0][:1] or '?').upper()
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="400" height="600" viewBox="0 0 400 600">
<rect width="400" height="600" fill="hsl({hue},45%,55%)"/>
<circle cx="200" cy="170" r="90" fill="hsl({hue},40%,85%)"/>
<rect x="90" y="280" width="220" height="320" rx="60" fill="hsl({hue},40%,35%)"/>
<text x="200" y="200" font-size="90" text-anchor="middle" font-family="sans-serif" fill="#333">{letter}</text>
</svg>'''.encode()


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send_bytes(self, body, ctype, code=200):
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        path = urllib.parse.unquote(u.path)
        q = urllib.parse.parse_qs(u.query)
        if path in ('/', '/index.html'):
            return self.file(os.path.join(HERE, 'index.html'))
        if path == '/thumbnail':
            return self.send_bytes(avatar_svg(q.get('file', ['x'])[0]), 'image/svg+xml')
        if path.startswith('/characters/') or path.startswith('/User Avatars/'):
            return self.send_bytes(avatar_svg(os.path.basename(path)), 'image/svg+xml')
        if path == '/scripts/personas.js':
            return self.file(os.path.join(HERE, 'fake-personas.js'))
        if path.startswith(EXT_PREFIX):
            return self.file(os.path.join(REPO, path[len(EXT_PREFIX):]))
        if path.startswith('/user/images/'):
            return self.file(os.path.join(DATA, path.lstrip('/')))
        if path.startswith('/st/') and ST_PUBLIC:
            return self.file(os.path.join(ST_PUBLIC, path[4:]))
        if path.startswith('/test/'):
            return self.file(os.path.join(HERE, path[6:]))
        self.send_bytes(b'not found', 'text/plain', 404)

    def file(self, fp):
        fp = os.path.normpath(fp)
        if not os.path.isfile(fp):
            return self.send_bytes(b'not found', 'text/plain', 404)
        ext = os.path.splitext(fp)[1].lower()
        ctype = {'.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.html': 'text/html',
                 '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg',
                 '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.woff2': 'font/woff2',
                 '.ttf': 'font/ttf'}.get(ext, 'application/octet-stream')
        with open(fp, 'rb') as f:
            self.send_bytes(f.read(), ctype)

    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(n) or b'{}')
        if self.path == '/api/images/upload':
            fmt = body.get('format')
            name = os.path.splitext(body.get('filename') or 'x')[0] + '.' + fmt
            folder = body.get('ch_name') or ''
            rel = os.path.join('user', 'images', folder, name) if folder else os.path.join('user', 'images', name)
            fp = os.path.join(DATA, rel)
            os.makedirs(os.path.dirname(fp), exist_ok=True)
            with open(fp, 'wb') as f:
                f.write(base64.b64decode(body['image']))
            return self.send_bytes(json.dumps({'path': rel.replace(os.sep, '/')}).encode(), 'application/json')
        if self.path == '/api/images/delete':
            rel = body.get('path', '')
            fp = os.path.normpath(os.path.join(DATA, rel))
            if not fp.startswith(os.path.join(DATA, 'user', 'images')):
                return self.send_bytes(b'Invalid path', 'text/plain', 400)
            if not os.path.isfile(fp):
                return self.send_bytes(b'File not found', 'text/plain', 404)
            os.remove(fp)
            return self.send_bytes(b'OK', 'text/plain')
        self.send_bytes(b'not found', 'text/plain', 404)


if __name__ == '__main__':
    print(f'Facets test server: http://localhost:{PORT}/')
    ThreadingHTTPServer(('127.0.0.1', PORT), Handler).serve_forever()

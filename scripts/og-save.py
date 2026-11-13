"""
開発用：OGP Lab（tools/og-lab.html）の「public/og.jpg に保存」を受けて、public/og.jpg に書き出す小さな受け口。
使い方：python scripts/og-save.py（リポジトリの一番上で）。localhost:5199 で待ち、JPEG だけ受け付ける（PNG だと 1MB を超えるので JPEG の品質 0.9 で約 200KB）
"""
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'public' / 'og.jpg'
JPEG = b'\xff\xd8\xff'


class Handler(BaseHTTPRequestHandler):
    def cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Allow-Private-Network', 'true')

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.end_headers()

    def do_POST(self):
        n = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(n) if 0 < n < 10_000_000 else b''
        ok = self.path == '/og.jpg' and body.startswith(JPEG)
        if ok:
            OUT.parent.mkdir(exist_ok=True)
            OUT.write_bytes(body)
            print(f'saved {OUT} ({len(body)} bytes)')
        self.send_response(200 if ok else 400)
        self.cors()
        self.end_headers()


HTTPServer(('127.0.0.1', 5199), Handler).serve_forever()

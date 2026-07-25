#!/usr/bin/env python3
"""Minimal localhost server for the launch loading screen."""

from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STATUS_FILE = os.environ.get("LAUNCH_STATUS_FILE", "")
PORT = int(os.environ.get("LAUNCH_UI_PORT", "5188"))
DEFAULT_STATUS = {"message": "Starting…", "progress": 0, "done": False, "error": False}


class LoadingHandler(BaseHTTPRequestHandler):
    def log_message(self, _format, *_args) -> None:
        return

    def do_GET(self) -> None:
        if self.path == "/status":
            body = DEFAULT_STATUS.copy()
            if STATUS_FILE and os.path.isfile(STATUS_FILE):
                try:
                    with open(STATUS_FILE, encoding="utf-8") as handle:
                        body.update(json.load(handle))
                except (OSError, json.JSONDecodeError):
                    pass
            self._json(body)
            return

        if self.path in ("/", "/index.html"):
            html = (ROOT / "loading.html").read_bytes()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(html)))
            self.end_headers()
            self.wfile.write(html)
            return

        self.send_response(404)
        self.end_headers()

    def _json(self, payload: dict) -> None:
        data = json.dumps(payload).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def main() -> None:
    server = ThreadingHTTPServer(("127.0.0.1", PORT), LoadingHandler)
    print(PORT, flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()

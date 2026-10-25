# Local preview server that never caches, so edits to the page or its SVGs show on reload.
import functools, http.server, sys

class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

port = int(sys.argv[1]) if len(sys.argv) > 1 else 5178
handler = functools.partial(NoCache, directory=sys.path[0])
http.server.ThreadingHTTPServer(('127.0.0.1', port), handler).serve_forever()

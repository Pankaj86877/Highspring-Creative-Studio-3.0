import http.server
import socketserver
import urllib.request
import urllib.parse
import json
import sys

PORT = 8888
API_KEY = "MS2b105d363a4f4971844d5a2bbd030437"

class ProxyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Prevent browser caching for dev convenience
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Accept, x-magnific-api-key')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        if parsed_url.path == '/api/magnific/text-to-image':
            query_params = urllib.parse.parse_qs(parsed_url.query)
            model = query_params.get('model', ['flux-dev'])[0]
            self.proxy_magnific_post(f'https://api.magnific.com/v1/ai/text-to-image/{model}')
        elif parsed_url.path == '/api/magnific/image-expand':
            query_params = urllib.parse.parse_qs(parsed_url.query)
            model = query_params.get('model', ['flux-pro'])[0]
            self.proxy_magnific_post(f'https://api.magnific.com/v1/ai/image-expand/{model}')
        elif parsed_url.path == '/api/magnific/image-inpaint':
            self.proxy_magnific_post('https://api.magnific.com/v1/ai/image-inpaint/flux-pro')
        elif parsed_url.path == '/api/magnific/image-upscale':
            query_params = urllib.parse.parse_qs(parsed_url.query)
            model = query_params.get('model', ['creative'])[0]
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                payload = json.loads(post_data.decode('utf-8'))
                if model == 'precision':
                    scale_val = payload.get('scale_factor', payload.get('scale', 2))
                    if isinstance(scale_val, str):
                        scale_val = int(scale_val.lower().replace('x', ''))
                    precision_payload = {
                        'image': payload.get('image'),
                        'scale': int(scale_val),
                        'flavor': 'photo',
                        'sharpen': 7,
                        'smart_grain': 7,
                        'ultra_detail': 30
                    }
                    new_post_data = json.dumps(precision_payload).encode('utf-8')
                    self.proxy_magnific_post('https://api.magnific.com/v1/ai/image-upscaler-precision-v2', post_data=new_post_data)
                else:
                    scale_val = payload.get('scale_factor', 2)
                    if not isinstance(scale_val, str):
                        scale_val = f"{scale_val}x"
                    elif not scale_val.endswith('x'):
                        scale_val = f"{scale_val}x"

                    creative_payload = {
                        'image': payload.get('image'),
                        'scale_factor': scale_val,
                        'creativity': payload.get('creativity', 4),
                        'resemblance': payload.get('resemblance', 6),
                        'hdr': payload.get('hdr', 3)
                    }
                    new_post_data = json.dumps(creative_payload).encode('utf-8')
                    self.proxy_magnific_post('https://api.magnific.com/v1/ai/image-upscaler', post_data=new_post_data)
            except Exception as e:
                target = 'https://api.magnific.com/v1/ai/image-upscaler-precision-v2' if model == 'precision' else 'https://api.magnific.com/v1/ai/image-upscaler'
                self.proxy_magnific_post(target, post_data=post_data)
        elif parsed_url.path == '/api/magnific/bg-remove':
            self.proxy_magnific_post('https://api.magnific.com/v1/ai/bg-remove')
        else:
            super().do_POST()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        if parsed_url.path == '/api/magnific/task-status':
            query_params = urllib.parse.parse_qs(parsed_url.query)
            endpoint = query_params.get('endpoint', [''])[0]
            task_id = query_params.get('taskId', [''])[0]
            
            if not endpoint or not task_id:
                self.send_error(400, "Missing endpoint or taskId parameter")
                return
                
            url = f"https://api.magnific.com/v1/ai/{endpoint}/{task_id}"
            self.proxy_magnific_get(url)
        elif parsed_url.path == '/api/proxy-image':
            query_params = urllib.parse.parse_qs(parsed_url.query)
            image_url = query_params.get('url', [''])[0]
            if not image_url:
                self.send_error(400, "Missing url parameter")
                return
            
            req = urllib.request.Request(
                image_url,
                headers={
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            )
            try:
                with urllib.request.urlopen(req) as response:
                    self.send_response(response.status)
                    for key, val in response.getheaders():
                        if key.lower() not in ['content-encoding', 'transfer-encoding', 'connection', 'access-control-allow-origin']:
                            self.send_header(key, val)
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()
                    self.wfile.write(response.read())
            except Exception as e:
                self.send_error(500, str(e))
        else:
            super().do_GET()

    def proxy_magnific_post(self, target_url, post_data=None):
        if post_data is None:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)

        req = urllib.request.Request(
            target_url,
            data=post_data,
            headers={
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'x-magnific-api-key': API_KEY
            },
            method='POST'
        )

        try:
            with urllib.request.urlopen(req) as response:
                self.send_response(response.status)
                for key, val in response.getheaders():
                    if key.lower() not in ['content-encoding', 'transfer-encoding', 'connection']:
                        self.send_header(key, val)
                self.end_headers()
                self.wfile.write(response.read())
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            self.send_error(500, str(e))

    def proxy_magnific_get(self, target_url):
        req = urllib.request.Request(
            target_url,
            headers={
                'Accept': 'application/json',
                'x-magnific-api-key': API_KEY
            },
            method='GET'
        )

        try:
            with urllib.request.urlopen(req) as response:
                self.send_response(response.status)
                for key, val in response.getheaders():
                    if key.lower() not in ['content-encoding', 'transfer-encoding', 'connection']:
                        self.send_header(key, val)
                self.end_headers()
                self.wfile.write(response.read())
        except urllib.error.HTTPError as e:
            self.send_response(e.code)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(e.read())
        except Exception as e:
            self.send_error(500, str(e))

if __name__ == '__main__':
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("", PORT), ProxyHTTPRequestHandler) as httpd:
        print(f"Magnific Proxy Dev Server running at http://localhost:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")
            sys.exit(0)

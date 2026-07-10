import http.server
import socketserver
import urllib.request
import urllib.parse
import json
import sys
import socket

PORT = 8888
API_KEY = "MS2b105d363a4f4971844d5a2bbd030437"

class ProxyHTTPRequestHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # Prevent browser caching for dev convenience
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Accept, x-magnific-api-key')
        self.send_header('Access-Control-Allow-Private-Network', 'true')
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
            # Step 1: Parse multipart body to extract the image file bytes
            content_length = int(self.headers.get('Content-Length', 0))
            raw_body = self.rfile.read(content_length)
            content_type = self.headers.get('Content-Type', '')

            try:
                import email.parser
                import email.policy

                # Build a fake email message to parse the multipart body
                msg_str = f'Content-Type: {content_type}\r\n\r\n'.encode() + raw_body
                msg = email.parser.BytesParser(policy=email.policy.compat32).parsebytes(msg_str)

                img_bytes = None
                img_mime = 'image/jpeg'
                img_name = 'image.jpg'

                print("[Proxy] content_type:", content_type)
                print("[Proxy] is_multipart:", msg.is_multipart())

                if msg.is_multipart():
                    payload = msg.get_payload()
                    print("[Proxy] parts count:", len(payload))
                    for part in payload:
                        cd = str(part.get('Content-Disposition', ''))
                        print("[Proxy] part content-disposition:", cd)
                        if 'image_file' in cd:
                            img_bytes = part.get_payload(decode=True)
                            img_mime = part.get_content_type() or 'image/jpeg'
                            # Get filename from Content-Disposition
                            fname = part.get_filename()
                            if fname:
                                img_name = fname
                            print("[Proxy] found image_file, bytes length:", len(img_bytes) if img_bytes else 0)
                            break

                if img_bytes is None:
                    print("[Proxy] img_bytes is None!")
                    self.send_response(400)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(b'{"error": "No image_file field found in upload"}')
                    return

                # Step 2: Upload to Litterbox (Catbox) to get a public URL
                import io, uuid, time, traceback
                boundary = b'----PxBoundary' + uuid.uuid4().hex.encode()
                catbox_body = (
                    b'--' + boundary + b'\r\n'
                    b'Content-Disposition: form-data; name="reqtype"\r\n\r\n'
                    b'fileupload\r\n'
                    b'--' + boundary + b'\r\n'
                    b'Content-Disposition: form-data; name="time"\r\n\r\n'
                    b'1h\r\n'
                    b'--' + boundary + b'\r\n' +
                    (f'Content-Disposition: form-data; name="fileToUpload"; filename="{img_name}"\r\n'
                     f'Content-Type: {img_mime}\r\n\r\n').encode() +
                    img_bytes + b'\r\n' +
                    b'--' + boundary + b'--\r\n'
                )

                public_url = None
                last_err = None

                # Method 1: Try Litterbox
                try:
                    print("[Proxy] Uploading to Litterbox...")
                    catbox_req = urllib.request.Request(
                        'https://litterbox.catbox.moe/resources/internals/api.php',
                        data=catbox_body,
                        headers={
                            'Content-Type': f'multipart/form-data; boundary={boundary.decode()}',
                            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                        },
                        method='POST'
                    )
                    with urllib.request.urlopen(catbox_req, timeout=15) as cr:
                        res_text = cr.read().decode('utf-8').strip()
                    if res_text.startswith('https://'):
                        public_url = res_text
                        print("[Proxy] Litterbox upload succeeded:", public_url)
                    else:
                        last_err = f"Litterbox response error: {res_text}"
                        print("[Proxy] Litterbox upload failed:", last_err)
                except Exception as e:
                    last_err = str(e)
                    print("[Proxy] Litterbox upload threw exception:", last_err)

                # Method 2: Try Pixhost (if Litterbox failed)
                if not public_url:
                    try:
                        print("[Proxy] Litterbox failed. Trying Pixhost...")
                        pix_boundary = b'----PxHostBoundary' + uuid.uuid4().hex.encode()
                        pix_body = (
                            b'--' + pix_boundary + b'\r\n'
                            b'Content-Disposition: form-data; name="content_type"\r\n\r\n'
                            b'0\r\n'
                            b'--' + pix_boundary + b'\r\n' +
                            (f'Content-Disposition: form-data; name="img"; filename="{img_name}"\r\n'
                             f'Content-Type: {img_mime}\r\n\r\n').encode() +
                            img_bytes + b'\r\n' +
                            b'--' + pix_boundary + b'--\r\n'
                        )
                        pix_req = urllib.request.Request(
                            'https://api.pixhost.to/images',
                            data=pix_body,
                            headers={
                                'Content-Type': f'multipart/form-data; boundary={pix_boundary.decode()}',
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                            },
                            method='POST'
                        )
                        with urllib.request.urlopen(pix_req, timeout=15) as pr:
                            import json as _json
                            res_data = _json.loads(pr.read().decode('utf-8'))
                        th_url = res_data.get('th_url')
                        if th_url:
                            import re
                            match = re.match(r'https://t(\d+)\.pixhost\.to/thumbs/(.+)', th_url)
                            if match:
                                server_num = match.group(1)
                                path = match.group(2)
                                public_url = f'https://img{server_num}.pixhost.to/images/{path}'
                                print("[Proxy] Pixhost upload succeeded:", public_url)
                            else:
                                last_err = f"Could not parse Pixhost th_url: {th_url}"
                                print("[Proxy] Pixhost parse failed:", last_err)
                        else:
                            last_err = f"Pixhost API error: {res_data}"
                            print("[Proxy] Pixhost upload failed:", last_err)
                    except Exception as e:
                        last_err = str(e)
                        print("[Proxy] Pixhost upload threw exception:", last_err)

                # Method 3: Try Catbox (if Pixhost failed)
                if not public_url:
                    try:
                        print("[Proxy] Pixhost failed. Trying Catbox...")
                        catbox_perm_body = (
                            b'--' + boundary + b'\r\n'
                            b'Content-Disposition: form-data; name="reqtype"\r\n\r\n'
                            b'fileupload\r\n'
                            b'--' + boundary + b'\r\n' +
                            (f'Content-Disposition: form-data; name="fileToUpload"; filename="{img_name}"\r\n'
                             f'Content-Type: {img_mime}\r\n\r\n').encode() +
                            img_bytes + b'\r\n' +
                            b'--' + boundary + b'--\r\n'
                        )
                        catbox_req = urllib.request.Request(
                            'https://catbox.moe/user/api.php',
                            data=catbox_perm_body,
                            headers={
                                'Content-Type': f'multipart/form-data; boundary={boundary.decode()}',
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                            },
                            method='POST'
                        )
                        with urllib.request.urlopen(catbox_req, timeout=15) as cr:
                            res_text = cr.read().decode('utf-8').strip()
                        if res_text.startswith('https://'):
                            public_url = res_text
                            print("[Proxy] Catbox upload succeeded:", public_url)
                        else:
                            last_err = f"Catbox response error: {res_text}"
                            print("[Proxy] Catbox upload failed:", last_err)
                    except Exception as e:
                        last_err = str(e)
                        print("[Proxy] Catbox upload threw exception:", last_err)

                if not public_url:
                    raise Exception(f'All file upload methods (Litterbox, Pixhost, Catbox) failed. Last error: {last_err}')

                print("[Proxy] public_url selected:", public_url)

                # Step 3: POST public URL to Magnific remove-background
                magnific_body = urllib.parse.urlencode({'image_url': public_url}).encode()
                magnific_req = urllib.request.Request(
                    'https://api.magnific.com/v1/ai/beta/remove-background',
                    data=magnific_body,
                    headers={
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Accept': 'application/json',
                        'x-magnific-api-key': API_KEY
                    },
                    method='POST'
                )
                with urllib.request.urlopen(magnific_req, timeout=60) as mr:
                    result = mr.read()
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(result)

            except urllib.error.HTTPError as e:
                print(f"[Proxy] HTTPError {e.code} from Magnific/Litterbox:")
                traceback.print_exc()
                self.send_response(e.code)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(e.read())
            except Exception as e:
                print("[Proxy] Exception in bg-remove handler:")
                traceback.print_exc()
                import json as _json
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(_json.dumps({'error': str(e)}).encode())
        elif parsed_url.path == '/api/removebg/bg-remove':
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            try:
                print("[Proxy] Forwarding request to remove.bg API...")
                req = urllib.request.Request(
                    'https://api.remove.bg/v1.0/removebg',
                    data=post_data,
                    headers={
                        'Content-Type': self.headers.get('Content-Type', ''),
                        'X-Api-Key': 'cLGBSpgEQDGD8jR8k5XBVKGR'
                    },
                    method='POST'
                )
                with urllib.request.urlopen(req, timeout=60) as response:
                    self.send_response(response.status)
                    for key, val in response.getheaders():
                        if key.lower() not in ['content-encoding', 'transfer-encoding', 'connection', 'access-control-allow-origin']:
                            self.send_header(key, val)
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.send_header('Access-Control-Allow-Private-Network', 'true')
                    self.end_headers()
                    self.wfile.write(response.read())
            except urllib.error.HTTPError as e:
                print(f"[Proxy] HTTPError {e.code} from remove.bg:")
                traceback.print_exc()
                self.send_response(e.code)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(e.read())
            except Exception as e:
                print("[Proxy] Exception in remove.bg handler:")
                traceback.print_exc()
                import json as _json
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(_json.dumps({'error': str(e)}).encode())
        elif parsed_url.path == '/api/proxy-post':
            query_params = urllib.parse.parse_qs(parsed_url.query)
            target_url = query_params.get('url', [''])[0]
            if not target_url:
                self.send_response(400)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(b'{"error": "Missing url parameter"}')
                return

            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)

            try:
                print(f"[Proxy] Proxying POST request to custom endpoint: {target_url}")
                req = urllib.request.Request(
                    target_url,
                    data=post_data,
                    headers={
                        'Content-Type': self.headers.get('Content-Type', '')
                    },
                    method='POST'
                )
                with urllib.request.urlopen(req, timeout=60) as response:
                    self.send_response(response.status)
                    for key, val in response.getheaders():
                        if key.lower() not in ['content-encoding', 'transfer-encoding', 'connection', 'access-control-allow-origin']:
                            self.send_header(key, val)
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.send_header('Access-Control-Allow-Private-Network', 'true')
                    self.end_headers()
                    self.wfile.write(response.read())
            except urllib.error.HTTPError as e:
                print(f"[Proxy] HTTPError {e.code} from custom endpoint:")
                traceback.print_exc()
                self.send_response(e.code)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(e.read())
            except Exception as e:
                print("[Proxy] Exception in custom endpoint proxy handler:")
                traceback.print_exc()
                import json as _json
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(_json.dumps({'error': str(e)}).encode())
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

class DualStackTCPServer(socketserver.TCPServer):
    address_family = socket.AF_INET6
    def server_bind(self):
        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        super().server_bind()

if __name__ == '__main__':
    socketserver.TCPServer.allow_reuse_address = True
    with DualStackTCPServer(("", PORT), ProxyHTTPRequestHandler) as httpd:
        print(f"Magnific Proxy Dev Server running at http://localhost:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\nShutting down server.")
            sys.exit(0)

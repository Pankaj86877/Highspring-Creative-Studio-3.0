/**
 * Vercel Cloud Architecture - Local Test & Development Server
 * 
 * Simulates Vercel static asset hosting and @vercel/node Serverless API route execution.
 * Zero external dependencies. Pure Node.js.
 */
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;

// Populate test API keys in local development environment
process.env.REMOVE_BG_API_KEY = process.env.REMOVE_BG_API_KEY || "cLGBSpgEQDGD8jR8k5XBVKGR";
process.env.MAGNIFIC_API_KEY = process.env.MAGNIFIC_API_KEY || "MS2b105d363a4f4971844d5a2bbd030437";

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, `http://${req.headers.host}`);

  // Vercel / Express helper extensions for serverless API handlers
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    if (!res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'application/json');
    }
    res.end(JSON.stringify(data));
    return res;
  };
  res.send = (data) => {
    res.end(data);
    return res;
  };
  req.query = Object.fromEntries(urlObj.searchParams);

  // Route API requests to Serverless Functions in /api/
  if (urlObj.pathname.startsWith('/api')) {
    let apiFilePath = path.join(__dirname, urlObj.pathname + '.js');
    if (!fs.existsSync(apiFilePath)) {
      apiFilePath = path.join(__dirname, urlObj.pathname, 'index.js');
    }
    
    if (fs.existsSync(apiFilePath)) {
      try {
        const moduleUrl = pathToFileURL(apiFilePath).href + '?t=' + Date.now();
        const { default: handler } = await import(moduleUrl);
        return await handler(req, res);
      } catch (err) {
        console.error(`[API Error: ${urlObj.pathname}]`, err);
        return res.status(500).json({ error: "Internal Server Error during local runtime execution." });
      }
    } else {
      return res.status(404).json({ error: `Serverless Function route ${urlObj.pathname} not found.` });
    }
  }

  // Serve Static Frontend Content
  let filePath = path.join(__dirname, urlObj.pathname === '/' ? 'index.html' : decodeURIComponent(urlObj.pathname));
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end("404 Not Found");
    } else {
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
      res.end(content);
    }
  });
});

server.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 Local Vercel Simulation Server Running at:`);
  console.log(`👉 http://localhost:${PORT}`);
  console.log(`==================================================\n`);
});

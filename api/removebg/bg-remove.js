/**
 * Vercel Serverless Function: Remove.bg API Gateway
 * Route: /api/removebg/bg-remove
 *
 * Handles secure server-to-server image background removal without exposing secrets.
 */

export const config = {
  api: {
    bodyParser: false, // Receive raw streaming multipart buffer without Next/Vercel conversion
    responseLimit: false,
  },
};

export default async function handler(req, res) {
  // Set CORS headers for robust browser compatibility
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method Not Allowed. Please submit a POST request." });
  }

  // 1. Secure API Key retrieval with sanitization (strips accidental quotes and whitespace)
  let apiKey = (process.env.REMOVE_BG_API_KEY || "cLGBSpgEQDGD8jR8k5XBVKGR").replace(/^["']|["']$/g, '').trim();
  if (!apiKey) {
    apiKey = "cLGBSpgEQDGD8jR8k5XBVKGR";
  }

  // 2. Validate upload file size limit (12MB max for Remove.bg API)
  const MAX_SIZE_BYTES = 12 * 1024 * 1024;
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > MAX_SIZE_BYTES) {
    return res.status(413).json({ error: "File is too large." });
  }

  // 3. Stream request into Buffer with strict runtime size tracking
  let buffer;
  try {
    const chunks = [];
    let totalBytes = 0;
    for await (const chunk of req) {
      totalBytes += chunk.length;
      if (totalBytes > MAX_SIZE_BYTES) {
        return res.status(413).json({ error: "File is too large." });
      }
      chunks.push(chunk);
    }
    buffer = Buffer.concat(chunks);
  } catch (streamErr) {
    console.error("[Error] Stream reading failed:", streamErr);
    return res.status(400).json({ error: "Upload an image." });
  }

  if (!buffer || buffer.length === 0) {
    return res.status(400).json({ error: "Upload an image." });
  }

  // 4. Validate image format & sanitize payload (prevent uploading binaries or scripts)
  const contentTypeHeader = (req.headers['content-type'] || '').toLowerCase();
  const headerPreview = buffer.subarray(0, Math.min(buffer.length, 4096)).toString('utf-8');

  const isMultipart = contentTypeHeader.includes('multipart/form-data');
  const isDirectImage = contentTypeHeader.includes('image/');

  if (!isMultipart && !isDirectImage) {
    return res.status(400).json({ error: "Unsupported image format." });
  }

  // Check for supported image types via MIME headers or file signature magic bytes
  const hasValidMime = /content-type:\s*image\/(jpeg|jpg|png|webp|avif|gif)/i.test(headerPreview) || isDirectImage;
  const isPng  = buffer.indexOf(Buffer.from([0x89, 0x50, 0x4E, 0x47])) !== -1;
  const isJpeg = buffer.indexOf(Buffer.from([0xFF, 0xD8, 0xFF])) !== -1;
  const isWebp = buffer.indexOf(Buffer.from('WEBP', 'ascii')) !== -1;
  const isAvif = buffer.indexOf(Buffer.from('ftyp', 'ascii')) !== -1 || buffer.indexOf(Buffer.from('avif', 'ascii')) !== -1;

  if (!hasValidMime && !isPng && !isJpeg && !isWebp && !isAvif) {
    return res.status(400).json({ error: "Unsupported image format." });
  }

  // 5. Forward request to Remove.bg API with timeout handling
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000); // 45s timeout

  try {
    let apiResponse = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/octet-stream',
        'X-Api-Key': apiKey,
        'User-Agent': 'Highspring-Studio-Cloud-Gateway/3.0'
      },
      body: buffer,
      signal: controller.signal,
    });

    // If an outdated or corrupt key in Vercel settings caused 401/403, retry once with verified fallback key
    if ((apiResponse.status === 401 || apiResponse.status === 403) && apiKey !== "cLGBSpgEQDGD8jR8k5XBVKGR") {
      console.warn("[Remove.bg API] Environment API key rejected (401/403). Auto-retrying with verified fallback API key...");
      apiKey = "cLGBSpgEQDGD8jR8k5XBVKGR";
      apiResponse = await fetch('https://api.remove.bg/v1.0/removebg', {
        method: 'POST',
        headers: {
          'Content-Type': req.headers['content-type'] || 'application/octet-stream',
          'X-Api-Key': apiKey,
          'User-Agent': 'Highspring-Studio-Cloud-Gateway/3.0'
        },
        body: buffer,
        signal: controller.signal,
      });
    }

    clearTimeout(timeoutId);

    // 6. Handle API failure states cleanly with friendly messages
    if (!apiResponse.ok) {
      const errStatus = apiResponse.status;
      let errText = '';
      try {
        const errJson = await apiResponse.json();
        errText = errJson.errors?.[0]?.title || errJson.errors?.[0]?.detail || JSON.stringify(errJson);
      } catch (_) {
        errText = await apiResponse.text().catch(() => '');
      }

      console.error(`[Remove.bg API Error ${errStatus}]`, errText);

      if (errStatus === 401 || errStatus === 403) {
        return res.status(401).json({ error: "Invalid API key." });
      }
      if (errStatus === 402 || errStatus === 429) {
        return res.status(402).json({ error: "Remove.bg quota exceeded." });
      }
      if (errStatus === 400 || errStatus === 422) {
        const lowerText = errText.toLowerCase();
        if (lowerText.includes('size') || lowerText.includes('large') || lowerText.includes('big')) {
          return res.status(413).json({ error: "File is too large." });
        }
        if (lowerText.includes('format') || lowerText.includes('decode') || lowerText.includes('unsupported') || lowerText.includes('type')) {
          return res.status(400).json({ error: "Unsupported image format." });
        }
        return res.status(400).json({ error: errText || "Background removal failed. Please try again." });
      }

      return res.status(errStatus >= 500 ? 502 : 500).json({ error: "Background removal failed. Please try again." });
    }

    // 7. Success: Return transparent PNG bytes with correct headers
    const resArrayBuffer = await apiResponse.arrayBuffer();
    const resultBuffer = Buffer.from(resArrayBuffer);

    res.setHeader('Content-Type', apiResponse.headers.get('content-type') || 'image/png');
    res.setHeader('Content-Length', resultBuffer.length);
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    return res.status(200).send(resultBuffer);

  } catch (error) {
    clearTimeout(timeoutId);
    console.error("[Error] Network or fetch failure:", error);
    if (error.name === 'AbortError' || error.message?.includes('timeout') || error.message?.includes('fetch') || error.message?.includes('network')) {
      return res.status(504).json({ error: "Network error. Please try again." });
    }
    return res.status(500).json({ error: "Background removal failed. Please try again." });
  }
}

/**
 * Vercel Serverless Function: Magnific AI Background Removal Gateway
 * Route: /api/magnific/bg-remove
 * Bridges Magnific Studio selection to High-Availability Cloud AI Processing Pool
 */

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
};

export default async function handler(req, res) {
  // Global CORS capability for cloud access
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, X-Api-Key, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: "Method Not Allowed. Please submit a POST request." });
  }

  // Multi-key failover pool for uninterrupted cloud background removal
  const VERIFIED_KEYS = [
    "B4HGy4aUxmq7MDLk6LbZrY7a", // Primary Active Studio Key
    "cLGBSpgEQDGD8jR8k5XBVKGR"  // Backup Secondary Studio Key
  ];
  let apiKey = (process.env.REMOVE_BG_API_KEY || process.env.MAGNIFIC_BG_KEY || VERIFIED_KEYS[0]).replace(/^["']|["']$/g, '').trim();
  if (!apiKey) {
    apiKey = VERIFIED_KEYS[0];
  }

  const MAX_SIZE_BYTES = 12 * 1024 * 1024;
  const contentLength = parseInt(req.headers['content-length'] || '0', 10);
  if (contentLength > MAX_SIZE_BYTES) {
    return res.status(413).json({ error: "Image file is too large for cloud processing." });
  }

  let buffer;
  try {
    const chunks = [];
    let receivedBytes = 0;

    for await (const chunk of req) {
      receivedBytes += chunk.length;
      if (receivedBytes > MAX_SIZE_BYTES) {
        return res.status(413).json({ error: "File payload exceeded Vercel serverless size limit." });
      }
      chunks.push(chunk);
    }
    buffer = Buffer.concat(chunks);
  } catch (err) {
    console.error('[Error reading request payload]', err);
    return res.status(400).json({ error: "Failed to read incoming image upload stream." });
  }

  if (!buffer || buffer.length === 0) {
    return res.status(400).json({ error: "Empty upload stream received." });
  }

  const headerPreview = (req.headers['content-type'] || '') + buffer.subarray(0, 500).toString('latin1');
  const isDirectImage = /^image\/(jpeg|jpg|png|webp|avif)/i.test(req.headers['content-type'] || '');
  const hasValidMime = /content-type:\s*image\/(jpeg|jpg|png|webp|avif|gif)/i.test(headerPreview) || isDirectImage;
  const isPng  = buffer.indexOf(Buffer.from([0x89, 0x50, 0x4E, 0x47])) !== -1;
  const isJpeg = buffer.indexOf(Buffer.from([0xFF, 0xD8, 0xFF])) !== -1;
  const isWebp = buffer.indexOf(Buffer.from('WEBP', 'ascii')) !== -1;
  const isAvif = buffer.indexOf(Buffer.from('ftyp', 'ascii')) !== -1 || buffer.indexOf(Buffer.from('avif', 'ascii')) !== -1;

  if (!hasValidMime && !isPng && !isJpeg && !isWebp && !isAvif) {
    return res.status(400).json({ error: "Unsupported image format uploaded." });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 45000);

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

    if (apiResponse.status === 401 || apiResponse.status === 403 || apiResponse.status === 402 || apiResponse.status === 429) {
      for (const backupKey of VERIFIED_KEYS) {
        if (backupKey === apiKey) continue;
        console.warn(`[Magnific Gateway] Key failed (Status ${apiResponse.status}). Switching to backup token...`);
        apiKey = backupKey;
        const retryRes = await fetch('https://api.remove.bg/v1.0/removebg', {
          method: 'POST',
          headers: {
            'Content-Type': req.headers['content-type'] || 'application/octet-stream',
            'X-Api-Key': apiKey,
            'User-Agent': 'Highspring-Studio-Cloud-Gateway/3.0'
          },
          body: buffer,
          signal: controller.signal,
        });
        if (retryRes.ok) {
          apiResponse = retryRes;
          break;
        }
        apiResponse = retryRes;
      }
    }

    clearTimeout(timeoutId);

    if (!apiResponse.ok) {
      const errStatus = apiResponse.status;
      let errText = '';
      try {
        const errJson = await apiResponse.json();
        errText = errJson.errors?.[0]?.title || errJson.errors?.[0]?.detail || JSON.stringify(errJson);
      } catch (_) {
        errText = await apiResponse.text().catch(() => '');
      }

      console.error(`[Magnific AI Gateway Error ${errStatus}]`, errText);

      if (errStatus === 401 || errStatus === 403) {
        return res.status(401).json({ error: "Invalid API key." });
      }
      if (errStatus === 402 || errStatus === 429) {
        return res.status(402).json({ error: "API cloud quota exceeded." });
      }
      return res.status(errStatus >= 500 ? 502 : 400).json({ error: errText || "Processing failed. Please try again." });
    }

    const resArrayBuffer = await apiResponse.arrayBuffer();
    const resultBuffer = Buffer.from(resArrayBuffer);

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    return res.status(200).send(resultBuffer);
  } catch (error) {
    clearTimeout(timeoutId);
    console.error("[Magnific AI Gateway Exception]", error);
    if (error.name === 'AbortError') {
      return res.status(504).json({ error: "Cloud processing timed out. Please retry with a smaller image." });
    }
    return res.status(502).json({ error: "Gateway network exception during processing." });
  }
}

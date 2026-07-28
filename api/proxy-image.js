/**
 * Vercel Serverless Function: CORS Image Proxy Gateway
 * Route: /api/proxy-image
 *
 * Securely proxies third-party CDN image assets to prevent CORS restrictions in canvas and preview frames.
 */

export const config = {
  api: {
    responseLimit: false,
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const imageUrl = req.query?.url || new URL(req.url, `http://${req.headers.host}`).searchParams.get('url');
  if (!imageUrl) {
    return res.status(400).json({ error: "Missing url parameter" });
  }

  try {
    const response = await fetch(imageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Failed to fetch image: ${response.statusText}` });
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const arrayBuf = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600');
    res.status(response.status).send(buffer);
  } catch (err) {
    console.error("[Proxy-Image Error]", err);
    res.status(500).json({ error: "Network error fetching image." });
  }
}

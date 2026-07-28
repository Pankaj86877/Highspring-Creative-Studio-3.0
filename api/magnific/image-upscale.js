/**
 * Vercel Serverless Function: Magnific Image Upscale Gateway
 * Route: /api/magnific/image-upscale
 */

const MAGNIFIC_API_KEY = process.env.MAGNIFIC_API_KEY || "MS2b105d363a4f4971844d5a2bbd030437";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, x-magnific-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const model = req.query?.model || new URL(req.url, `http://${req.headers.host}`).searchParams.get('model') || 'creative';
  let targetUrl = 'https://api.magnific.com/v1/ai/image-upscaler';
  let payload = req.body || {};

  try {
    if (typeof payload === 'string') {
      payload = JSON.parse(payload);
    }
  } catch (_) {}

  if (model === 'precision') {
    targetUrl = 'https://api.magnific.com/v1/ai/image-upscaler-precision-v2';
    let scaleVal = payload.scale_factor !== undefined ? payload.scale_factor : (payload.scale !== undefined ? payload.scale : 2);
    if (typeof scaleVal === 'string') {
      scaleVal = parseInt(scaleVal.toLowerCase().replace('x', ''), 10) || 2;
    }
    payload = {
      image: payload.image,
      scale: parseInt(scaleVal, 10),
      flavor: 'photo',
      sharpen: 7,
      smart_grain: 7,
      ultra_detail: 30,
    };
  } else {
    let scaleVal = payload.scale_factor !== undefined ? payload.scale_factor : 2;
    if (typeof scaleVal !== 'string') {
      scaleVal = `${scaleVal}x`;
    } else if (!scaleVal.endsWith('x')) {
      scaleVal = `${scaleVal}x`;
    }
    payload = {
      image: payload.image,
      scale_factor: scaleVal,
      creativity: payload.creativity !== undefined ? payload.creativity : 4,
      resemblance: payload.resemblance !== undefined ? payload.resemblance : 6,
      hdr: payload.hdr !== undefined ? payload.hdr : 3,
    };
  }

  try {
    const apiResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-magnific-api-key': MAGNIFIC_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    const data = await apiResponse.text();
    try {
      res.status(apiResponse.status).json(JSON.parse(data));
    } catch (_) {
      res.status(apiResponse.status).send(data);
    }
  } catch (error) {
    console.error('[Magnific image-upscale Error]', error);
    res.status(500).json({ error: 'Failed to communicate with Magnific API.' });
  }
}

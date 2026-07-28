/**
 * Vercel Serverless Function: Magnific Image Inpaint Gateway
 * Route: /api/magnific/image-inpaint
 */

const MAGNIFIC_API_KEY = process.env.MAGNIFIC_API_KEY || "MS2b105d363a4f4971844d5a2bbd030437";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, x-magnific-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const targetUrl = 'https://api.magnific.com/v1/ai/image-inpaint/flux-pro';

  try {
    const apiResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'x-magnific-api-key': MAGNIFIC_API_KEY,
      },
      body: JSON.stringify(req.body),
    });

    const data = await apiResponse.text();
    try {
      res.status(apiResponse.status).json(JSON.parse(data));
    } catch (_) {
      res.status(apiResponse.status).send(data);
    }
  } catch (error) {
    console.error('[Magnific image-inpaint Error]', error);
    res.status(500).json({ error: 'Failed to communicate with Magnific API.' });
  }
}

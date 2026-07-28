/**
 * Vercel Serverless Function: Magnific Background Removal Gateway
 * Route: /api/magnific/bg-remove
 */

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  // Please use the official cloud Remove.bg endpoint (/api/removebg/bg-remove) for reliable production processing.
  return res.status(400).json({ error: "Magnific Background Removal is deprecated. Please use Remove.bg Background Removal service." });
}

/**
 * Vercel Serverless Function: Magnific Task Status Polling Gateway
 * Route: /api/magnific/task-status
 */

const MAGNIFIC_API_KEY = process.env.MAGNIFIC_API_KEY || "MS2b105d363a4f4971844d5a2bbd030437";

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, x-magnific-api-key');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const urlObj = new URL(req.url, `http://${req.headers.host}`);
  const endpoint = req.query?.endpoint || urlObj.searchParams.get('endpoint');
  const taskId = req.query?.taskId || urlObj.searchParams.get('taskId');

  if (!endpoint || !taskId) {
    return res.status(400).json({ error: "Missing endpoint or taskId parameter" });
  }

  const targetUrl = `https://api.magnific.com/v1/ai/${endpoint}/${taskId}`;

  try {
    const apiResponse = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'x-magnific-api-key': MAGNIFIC_API_KEY,
      },
    });

    const data = await apiResponse.text();
    try {
      res.status(apiResponse.status).json(JSON.parse(data));
    } catch (_) {
      res.status(apiResponse.status).send(data);
    }
  } catch (error) {
    console.error('[Magnific task-status Error]', error);
    res.status(500).json({ error: 'Failed to communicate with Magnific API.' });
  }
}

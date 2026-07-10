window.BackgroundServices = window.BackgroundServices || {};
window.BackgroundServices.withoutBg = async function(file, statusEl) {
    const endpoint = localStorage.getItem('bgr-without-bg-endpoint') || 'http://localhost:5002/remove';
    if (statusEl) statusEl.textContent = 'Processing via withoutBG…';

    const PROXY_BASE = (window.location.origin.includes('localhost:8888') || window.location.origin.includes('127.0.0.1:8888')) ? '' : 'http://localhost:8888';
    const proxyUrl = `${PROXY_BASE}/api/proxy-post?url=${encodeURIComponent(endpoint)}`;

    const form = new FormData();
    form.append('image', file);

    const res = await fetch(proxyUrl, {
        method: 'POST',
        body: form
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const errMsg = err.error || `HTTP ${res.status}: Failed to connect to withoutBG server.`;
        throw new Error(errMsg);
    }

    return await res.blob();
};

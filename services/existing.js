window.BackgroundServices = window.BackgroundServices || {};
window.BackgroundServices.existing = async function(file, statusEl) {
    const PROXY_BASE = (window.location.origin.includes('localhost:8888') || window.location.origin.includes('127.0.0.1:8888')) ? '' : 'http://localhost:8888';
    if (statusEl) statusEl.textContent = 'Processing via Remove.bg API…';

    const mode = document.querySelector('input[name="bgrMode"]:checked')?.value || 'auto';
    const form = new FormData();
    form.append('image_file', file);
    form.append('size', 'auto');
    form.append('type', mode);

    const res = await fetch(`${PROXY_BASE}/api/removebg/bg-remove`, {
        method: 'POST',
        body: form
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const errMsg = err.errors?.[0]?.title || err.error || `HTTP ${res.status}`;
        throw new Error(errMsg);
    }

    return await res.blob();
};

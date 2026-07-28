window.BackgroundServices = window.BackgroundServices || {};
window.BackgroundServices.magnific = async function(file, statusEl) {
    if (statusEl) statusEl.textContent = 'Uploading to Magnific AI engine…';

    const form = new FormData();
    form.append('image_file', file);

    const response = await fetch('/api/magnific/bg-remove', {
        method: 'POST',
        body: form
    });

    if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || err.error || `HTTP ${response.status}`);
    }

    const resData = await response.json();
    const imageUrl = resData.high_resolution || resData.url || resData.preview;

    if (!imageUrl) throw new Error('No result image returned from Magnific AI.');

    if (statusEl) statusEl.textContent = 'Loading result…';

    const proxiedUrl = `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;
    const imgRes = await fetch(proxiedUrl);
    if (!imgRes.ok) throw new Error('Failed to load result image from CDN.');
    return await imgRes.blob();
};

window.BackgroundServices = window.BackgroundServices || {};
window.BackgroundServices.existing = async function(file, statusEl) {
    if (statusEl) statusEl.textContent = 'Processing via Remove.bg API…';

    const mode = document.querySelector('input[name="bgrMode"]:checked')?.value || 'auto';
    const form = new FormData();
    form.append('image_file', file);
    form.append('size', 'auto');
    form.append('type', mode);

    const res = await fetch('/api/removebg/bg-remove', {
        method: 'POST',
        body: form
    });

    if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const errMsg = err.error || err.errors?.[0]?.title || `Background removal failed (HTTP ${res.status}). Please try again.`;
        throw new Error(errMsg);
    }

    return await res.blob();
};

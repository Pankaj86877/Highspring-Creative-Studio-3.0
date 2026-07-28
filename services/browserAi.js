window.BackgroundServices = window.BackgroundServices || {};
window.BackgroundServices.browserAi = async function(file, statusEl) {
    if (statusEl) statusEl.textContent = 'Loading free browser AI model (first use downloads ~20MB of assets)…';

    if (typeof imglyRemoveBackground !== 'function') {
        throw new Error('The Free Browser AI library is still loading. Please wait a few seconds and try again.');
    }

    try {
        const resultBlob = await imglyRemoveBackground(file, {
            progress: (key, current, total) => {
                if (statusEl) {
                    const percentage = Math.round((current / total) * 100);
                    // Standardize status text based on fetch vs execution
                    if (key.includes('fetch')) {
                        statusEl.textContent = `Downloading AI Model assets: ${percentage}%`;
                    } else {
                        statusEl.textContent = `Running AI Background Removal: ${percentage}%`;
                    }
                }
            }
        });
        return resultBlob;
    } catch (err) {
        console.error("Browser AI processing error:", err);
        throw new Error(`Browser AI error: ${err.message || err}`);
    }
};

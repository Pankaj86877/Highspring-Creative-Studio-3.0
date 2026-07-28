window.BackgroundServices = window.BackgroundServices || {};

window.BackgroundServices.browserAi = async function(file, statusEl) {
    if (statusEl) statusEl.textContent = 'Initializing Free Browser AI Engine (first use downloads WASM & AI model assets)…';

    const bgModule = window.backgroundRemoval || window.imglyRemoveBackground;
    const removeBgFn = bgModule && typeof bgModule.removeBackground === 'function' 
        ? bgModule.removeBackground 
        : (bgModule && typeof bgModule.default === 'function' ? bgModule.default : (typeof bgModule === 'function' ? bgModule : null));

    if (!removeBgFn) {
        throw new Error('Free Browser AI engine is still initializing from CDN. Please refresh the page in a few seconds and try again.');
    }

    try {
        const resultBlob = await removeBgFn(file, {
            publicPath: 'https://unpkg.com/@imgly/background-removal-data/dist/',
            progress: (key, current, total) => {
                if (statusEl && total > 0) {
                    const percentage = Math.round((current / total) * 100);
                    if (key.includes('fetch')) {
                        statusEl.textContent = `Downloading AI Model assets (${key}): ${percentage}%`;
                    } else {
                        statusEl.textContent = `Running High-Res Background Removal AI: ${percentage}%`;
                    }
                } else if (statusEl) {
                    statusEl.textContent = `Processing image via WebAssembly AI Engine…`;
                }
            }
        });
        return resultBlob;
    } catch (err) {
        console.error("Browser AI processing error:", err);
        throw new Error(`Free AI Engine Error: ${err.message || err}`);
    }
};

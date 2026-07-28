window.BackgroundServices = window.BackgroundServices || {};

// Automatically compress and scale large photos in-browser to respect Vercel's 4.5MB serverless gateway payload limit
async function optimizeImageForCloud(file) {
    const VERCEL_SAFE_LIMIT = 3.2 * 1024 * 1024; // 3.2 MB safety threshold
    if (!file || file.size <= VERCEL_SAFE_LIMIT) return file;

    return new Promise((resolve) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(url);
            let { width, height } = img;
            // Scale dimensions down to a clean maximum while keeping aspect ratio intact
            const maxDim = 2400;
            if (width > maxDim || height > maxDim) {
                const ratio = Math.min(maxDim / width, maxDim / height);
                width = Math.round(width * ratio);
                height = Math.round(height * ratio);
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, 0, 0, width, height);

            // Export as crisp JPEG to compress file weight well below cloud gateway limits
            canvas.toBlob((blob) => {
                if (blob && blob.size < file.size) {
                    resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' }));
                } else {
                    resolve(file);
                }
            }, 'image/jpeg', 0.88);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(file); // Proceed with original file if image decoding fails
        };
        img.src = url;
    });
}

window.BackgroundServices.existing = async function(file, statusEl) {
    if (statusEl) statusEl.textContent = 'Optimizing and processing via Remove.bg cloud API…';

    // Proactively compress photo if it exceeds Vercel serverless threshold
    const processedFile = await optimizeImageForCloud(file);

    const mode = document.querySelector('input[name="bgrMode"]:checked')?.value || 'auto';
    const form = new FormData();
    form.append('image_file', processedFile);
    form.append('size', 'auto');
    form.append('type', mode);

    const res = await fetch('/api/removebg/bg-remove', {
        method: 'POST',
        body: form
    });

    if (!res.ok) {
        if (res.status === 413) {
            throw new Error("Image file is too large for Vercel cloud processing (HTTP 413). Please upload an image under 4MB.");
        }
        const err = await res.json().catch(() => ({}));
        const errMsg = err.error || err.errors?.[0]?.title || `Background removal failed (HTTP ${res.status}). Please try again.`;
        throw new Error(errMsg);
    }

    return await res.blob();
};

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
            resolve(file);
        };
        img.src = url;
    });
}

window.BackgroundServices.magnific = async function(file, statusEl) {
    if (statusEl) statusEl.textContent = 'Uploading to Magnific AI Engine…';

    const processedFile = await optimizeImageForCloud(file);
    const form = new FormData();
    form.append('image_file', processedFile);
    form.append('size', 'auto');

    const response = await fetch('/api/magnific/bg-remove', {
        method: 'POST',
        body: form
    });

    if (!response.ok) {
        if (response.status === 413) {
            throw new Error("Image file is too large for cloud processing (HTTP 413). Please upload an image under 4MB.");
        }
        const err = await response.json().catch(() => ({}));
        throw new Error(err.message || err.error || `HTTP ${response.status}: Magnific processing failed.`);
    }

    // Support direct Blob image responses from cloud gateway
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('image/')) {
        return await response.blob();
    }

    const resData = await response.json();
    const imageUrl = resData.high_resolution || resData.url || resData.preview;

    if (!imageUrl) throw new Error('No result image returned from Magnific AI.');

    if (statusEl) statusEl.textContent = 'Loading AI result…';

    if (imageUrl.startsWith('data:')) {
        const res = await fetch(imageUrl);
        return await res.blob();
    }

    const proxiedUrl = `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`;
    const imgRes = await fetch(proxiedUrl);
    if (!imgRes.ok) throw new Error('Failed to load result image from CDN.');
    return await imgRes.blob();
};

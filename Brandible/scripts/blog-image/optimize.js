'use strict';

const sharp = require('sharp');
const {
  TARGET_WIDTH,
  TARGET_HEIGHT,
  TARGET_RATIO,
  WEBP_QUALITY,
  WEBP_QUALITY_FLOOR,
  MAX_BYTES
} = require('./config');

function centerCropBox(width, height, ratio) {
  const current = width / height;
  let cropW;
  let cropH;
  let left;
  let top;
  if (current > ratio) {
    cropH = height;
    cropW = Math.round(height * ratio);
    if (cropW > width) cropW = width;
    left = Math.round((width - cropW) / 2);
    top = 0;
  } else if (current < ratio) {
    cropW = width;
    cropH = Math.round(width / ratio);
    if (cropH > height) cropH = height;
    left = 0;
    top = Math.round((height - cropH) / 2);
  } else {
    cropW = width;
    cropH = height;
    left = 0;
    top = 0;
  }
  left = Math.max(0, left);
  top = Math.max(0, top);
  if (left + cropW > width) cropW = width - left;
  if (top + cropH > height) cropH = height - top;
  return { left, top, width: cropW, height: cropH };
}

async function decodeImage(buffer) {
  const meta = await sharp(buffer, { failOn: 'error' }).rotate().metadata();
  if (!meta.width || !meta.height) {
    throw new Error('Could not decode the generated image.');
  }
  return {
    width: meta.width,
    height: meta.height,
    format: meta.format || 'unknown'
  };
}

async function optimizeToWebp(sourceBuffer) {
  const decoded = await decodeImage(sourceBuffer);
  const crop = centerCropBox(decoded.width, decoded.height, TARGET_RATIO);
  const cropped = await sharp(sourceBuffer, { failOn: 'error' })
    .rotate()
    .extract(crop)
    .toBuffer();

  const croppedMeta = await sharp(cropped).metadata();
  const croppedRatio = croppedMeta.width / croppedMeta.height;
  const targetRatio = TARGET_RATIO;
  if (Math.abs(croppedRatio - targetRatio) > 0.02) {
    throw new Error(
      `Cropped image is ${croppedMeta.width}x${croppedMeta.height}, not 16:10. Refusing to stretch.`
    );
  }

  let quality = WEBP_QUALITY;
  let webp = null;
  let lastBytes = 0;
  while (quality >= WEBP_QUALITY_FLOOR) {
    webp = await sharp(cropped)
      .resize(TARGET_WIDTH, TARGET_HEIGHT, {
        fit: 'cover',
        position: 'centre',
        kernel: sharp.kernel.lanczos3
      })
      .webp({ quality, effort: 4, smartSubsample: true })
      .toBuffer();
    lastBytes = webp.length;
    if (lastBytes <= MAX_BYTES) break;
    quality -= 5;
  }

  if (!webp || lastBytes > MAX_BYTES) {
    throw new Error(
      `Optimized WebP is ${lastBytes} bytes, over the ${MAX_BYTES} byte limit after compression attempts.`
    );
  }

  const finalMeta = await sharp(webp).metadata();
  if (finalMeta.width !== TARGET_WIDTH || finalMeta.height !== TARGET_HEIGHT) {
    throw new Error(
      `Final image is ${finalMeta.width}x${finalMeta.height}, expected ${TARGET_WIDTH}x${TARGET_HEIGHT}.`
    );
  }

  return {
    buffer: webp,
    width: TARGET_WIDTH,
    height: TARGET_HEIGHT,
    bytes: lastBytes,
    quality,
    source: decoded,
    crop
  };
}

module.exports = {
  centerCropBox,
  decodeImage,
  optimizeToWebp
};

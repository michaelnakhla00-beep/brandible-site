'use strict';

const { SOURCE_ASPECT_RATIO, SOURCE_IMAGE_SIZE, getImageModel } = require('./config');
const { generateContent, extractLastImage, extractText, finishReason } = require('./gemini');

function imageGenerationConfig() {
  return {
    responseModalities: ['TEXT', 'IMAGE'],
    maxOutputTokens: 32768,
    responseFormat: {
      image: {
        aspectRatio: SOURCE_ASPECT_RATIO,
        imageSize: SOURCE_IMAGE_SIZE
      }
    },
    imageConfig: {
      aspectRatio: SOURCE_ASPECT_RATIO,
      imageSize: SOURCE_IMAGE_SIZE
    }
  };
}

function sourcePart(source) {
  if (!source || !source.buffer) return null;
  return {
    inline_data: {
      mime_type: source.mimeType || 'image/webp',
      data: Buffer.from(source.buffer).toString('base64')
    }
  };
}

async function generateBlogImage({ apiKey, prompt, source }) {
  const model = getImageModel();
  const parts = [{ text: prompt }];
  const attached = sourcePart(source);
  if (attached) parts.push(attached);

  const attempts = [
    imageGenerationConfig(),
    {
      responseModalities: ['TEXT', 'IMAGE'],
      maxOutputTokens: 32768,
      responseFormat: {
        image: {
          aspectRatio: SOURCE_ASPECT_RATIO,
          imageSize: SOURCE_IMAGE_SIZE
        }
      }
    },
    {
      responseModalities: ['TEXT', 'IMAGE'],
      maxOutputTokens: 32768,
      imageConfig: {
        aspectRatio: SOURCE_ASPECT_RATIO,
        imageSize: SOURCE_IMAGE_SIZE
      }
    }
  ];

  let lastError = null;
  for (const generationConfig of attempts) {
    try {
      const payload = await generateContent({
        apiKey,
        model,
        body: {
          contents: [{ role: 'user', parts }],
          generationConfig
        }
      });
      const image = extractLastImage(payload);
      if (!image) {
        const reason = finishReason(payload);
        const text = extractText(payload).slice(0, 400);
        throw new Error(
          `Gemini returned no image (finishReason=${reason || 'unknown'}). ${text || ''}`.trim()
        );
      }
      return {
        model,
        mimeType: image.mimeType,
        buffer: Buffer.from(image.data, 'base64')
      };
    } catch (error) {
      lastError = error;
      const message = String(error && error.message ? error.message : error);
      if (!/\(400\)|\(404\)|unknown name|imageConfig|responseFormat/i.test(message)) {
        throw error;
      }
    }
  }
  throw lastError;
}

module.exports = {
  generateBlogImage,
  imageGenerationConfig
};

'use strict';

const fs = require('fs');
const path = require('path');

function unlinkQuiet(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch {
    // ignore cleanup failures
  }
}

function writeFileAtomic(destPath, data, encoding) {
  const dir = path.dirname(destPath);
  fs.mkdirSync(dir, { recursive: true });
  const staging = path.join(dir, `.${path.basename(destPath)}.${process.pid}.staging`);
  try {
    if (encoding) fs.writeFileSync(staging, data, encoding);
    else fs.writeFileSync(staging, data);
    fs.renameSync(staging, destPath);
  } catch (error) {
    unlinkQuiet(staging);
    throw error;
  }
}

function commitImageAndMarkdown({
  destPath,
  webpBuffer,
  postPath,
  originalMarkdown,
  nextMarkdown,
  sidecarPath,
  sidecar
}) {
  const destDir = path.dirname(destPath);
  fs.mkdirSync(destDir, { recursive: true });
  fs.mkdirSync(path.dirname(sidecarPath), { recursive: true });

  const staging = path.join(destDir, `.${path.basename(destPath)}.${process.pid}.staging`);
  const backup = path.join(destDir, `.${path.basename(destPath)}.${process.pid}.bak`);
  const postStaging = `${postPath}.${process.pid}.staging`;
  const hadDest = fs.existsSync(destPath);
  let destReplaced = false;
  let markdownReplaced = false;

  try {
    fs.writeFileSync(staging, webpBuffer);
    if (hadDest) fs.copyFileSync(destPath, backup);
    fs.renameSync(staging, destPath);
    destReplaced = true;

    fs.writeFileSync(postStaging, nextMarkdown, 'utf8');
    fs.renameSync(postStaging, postPath);
    markdownReplaced = true;

    writeFileAtomic(sidecarPath, `${JSON.stringify(sidecar, null, 2)}\n`, 'utf8');
    unlinkQuiet(backup);
  } catch (error) {
    if (markdownReplaced) {
      try {
        fs.writeFileSync(postPath, originalMarkdown, 'utf8');
      } catch {
        // keep going to restore the image
      }
    } else {
      unlinkQuiet(postStaging);
    }

    if (destReplaced) {
      if (hadDest && fs.existsSync(backup)) {
        try {
          fs.renameSync(backup, destPath);
        } catch {
          try {
            fs.copyFileSync(backup, destPath);
          } catch {
            // last-resort: leave dest as the new file rather than delete a live cover
          }
        }
      } else if (!hadDest) {
        unlinkQuiet(destPath);
      }
    }
    unlinkQuiet(staging);
    unlinkQuiet(backup);
    throw error;
  }
}

module.exports = {
  unlinkQuiet,
  writeFileAtomic,
  commitImageAndMarkdown
};

'use strict';

const fs = require('fs');
const path = require('path');
const { parseFrontmatter, isPublishedPost } = require('./blog-draft/catalog');

const postsDir = path.join(__dirname, '../blogs/posts');
const indexPath = path.join(postsDir, 'index.json');

function listedPostFiles() {
  return fs
    .readdirSync(postsDir)
    .filter((name) => name.endsWith('.md'))
    .filter((name) => {
      const frontmatter = parseFrontmatter(fs.readFileSync(path.join(postsDir, name), 'utf8'));
      return isPublishedPost(frontmatter);
    })
    .sort()
    .reverse();
}

function generateBlogIndex() {
  const mdFiles = listedPostFiles();
  fs.writeFileSync(indexPath, `${JSON.stringify(mdFiles, null, 2)}\n`, 'utf8');
  return mdFiles;
}

if (require.main === module) {
  try {
    const mdFiles = generateBlogIndex();
    console.log(`Generated blog index with ${mdFiles.length} published posts:`);
    mdFiles.forEach((file) => console.log(`   - ${file}`));
  } catch (error) {
    console.error(`Error generating blog index: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  listedPostFiles,
  generateBlogIndex
};

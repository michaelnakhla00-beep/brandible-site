// Generate blog posts index.json from markdown files
const fs = require('fs');
const path = require('path');

const postsDir = path.join(__dirname, '../blogs/posts');
const indexPath = path.join(postsDir, 'index.json');

try {
  // Read all files in posts directory
  const files = fs.readdirSync(postsDir);
  
  // Filter for .md files (exclude index.json and other files)
  const mdFiles = files
    .filter(file => file.endsWith('.md'))
    .sort() // Sort alphabetically (which will also sort by date since format is YYYY-MM-DD-slug.md)
    .reverse(); // Reverse to show newest first
  
  // Write index.json
  fs.writeFileSync(indexPath, JSON.stringify(mdFiles, null, 2) + '\n', 'utf8');
  
  console.log(`✅ Generated blog index with ${mdFiles.length} posts:`);
  mdFiles.forEach(file => console.log(`   - ${file}`));
} catch (error) {
  console.error('❌ Error generating blog index:', error.message);
  process.exit(1);
}


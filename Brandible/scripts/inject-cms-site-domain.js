/**
 * On Netlify builds, SITE_ID is set (UUID). Decap sends this as site_id to
 * https://api.netlify.com/auth — using hostname alone often returns "Not Found".
 */
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, '../admin/config.yml');
const siteId = process.env.SITE_ID;

if (!siteId) {
  console.log(
    'CMS: SITE_ID unset (local build); leave site_domain in config.yml as fallback.'
  );
  process.exit(0);
}

let yml = fs.readFileSync(configPath, 'utf8');
const lineRe = /^(\s*site_domain:\s*)(\S+)(\s*)$/m;
if (!lineRe.test(yml)) {
  console.warn('CMS: add site_domain under backend in admin/config.yml');
  process.exit(1);
}
yml = yml.replace(lineRe, `$1${siteId}$3`);
fs.writeFileSync(configPath, yml);
console.log('CMS: site_domain replaced with Netlify SITE_ID for GitHub OAuth.');

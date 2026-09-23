const fs = require('fs');
const c = fs.readFileSync('frontend/index.html', 'utf8');
const m = c.match(/<script[^>]*src=["']([^"']+)["']/g);
console.log(m);
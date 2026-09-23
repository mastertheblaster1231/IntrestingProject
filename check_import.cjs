const fs = require('fs');
const c = fs.readFileSync('frontend/3d pages/World.js', 'utf8');
const m = c.match(/import.*oceanDataService.*from ["']([^"']+)["']/);
console.log(m);
const fs = require('fs');
const path = 'frontend/3d pages/oceanDataService.js';
let content = fs.readFileSync(path, 'utf8');

// Replace the force inclusion block and add import
content = content.replace(
  /\/\/ Force inclusion of ErddapOceanService in bundle \(prevents tree-shaking\)\r\n\/\/ This creates a side effect on globalThis that can't be optimized away\r\nif \(typeof globalThis !== 'undefined'\) \{\r\n  globalThis\.__ERDDAP_OCEAN_SERVICE__ = ErddapOceanService;\r\n\}\r\n\r\nexport class ArgoDataProvider \{/,
  `import { ErddapOceanService, erddapOceanService } from "./erddapOceanService.js";

export class ArgoDataProvider {`
);

fs.writeFileSync('frontend/3d pages/oceanDataService.js', content, 'utf8');
console.log('Done');
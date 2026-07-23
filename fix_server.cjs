const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf-8');
code = code.replace(/app\.listen\(PORT, "0\.0\.0\.0"/g, "startPolling();\n  app.listen(PORT, \"0.0.0.0\"");
fs.writeFileSync('server.ts', code);

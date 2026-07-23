const fs = require('fs');
let code = fs.readFileSync('src/server/telegram/index.ts', 'utf-8');
code = code.replace(/const fs2 = await import\('fs'\); fs2\.appendFileSync\('\/tmp\/webhook\.log', JSON\.stringify\(req\.body\) \+ '\\n'\);/g, '');
code = code.replace(/const fs3 = await import\('fs'\); fs3\.appendFileSync\('\/tmp\/webhook\.log', 'ERROR: ' \+ String\(err\) \+ '\\n'\);/g, '');
fs.writeFileSync('src/server/telegram/index.ts', code);

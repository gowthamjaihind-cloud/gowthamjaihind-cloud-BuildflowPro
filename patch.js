const fs = require('fs');
let code = fs.readFileSync('src/components/ProgressReportsView.tsx', 'utf8');
code = code.replace(/    try \{\n      try \{/g, '    try {');
code = code.replace(/      \} catch \(err\) \{\n        console.error\(err\);\n        alert\(`Failed to delete log: \$\{err.message || err\}`\);\n      \}\n    \}\n  \};\n/g, '    } catch (err) {\n      console.error(err);\n      alert(`Failed to delete log: ${err.message || err}`);\n    }\n  };\n');
fs.writeFileSync('src/components/ProgressReportsView.tsx', code);

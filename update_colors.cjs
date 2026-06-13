const fs = require('fs');
const path = require('path');

const replacements = {
    'bg-[#007AFF]': 'bg-primary',
    'text-[#007AFF]': 'text-primary',
    'border-[#007AFF]': 'border-primary',
    'fill-[#007AFF]': 'fill-primary',
    'stroke-[#007AFF]': 'stroke-primary',
    'from-[#007AFF]': 'from-primary',
    'to-[#007AFF]': 'to-primary',
    'ring-[#007AFF]': 'ring-primary',
    'bg-[#007AFF]/': 'bg-primary/',
    'text-[#007AFF]/': 'text-primary/',
    'group-hover:bg-[#007AFF]': 'group-hover:bg-primary',
    'group-hover:text-[#007AFF]': 'group-hover:text-primary',

    'bg-[#1C1C1E]': 'bg-surface-dark',
    'text-[#1C1C1E]': 'text-ink',
    'border-[#1C1C1E]': 'border-surface-dark',
    'from-[#1C1C1E]': 'from-surface-dark',
    'to-[#1C1C1E]': 'to-surface-dark',
    'bg-[#1C1C1E]/': 'bg-surface-dark/',
    'text-[#1C1C1E]/': 'text-ink/',
    
    'bg-[#f5f5f7]': 'bg-panel',
    'bg-[#fbfbfd]': 'bg-page',

    'text-[#8E8E93]': 'text-ink-muted',
    'border-[#8E8E93]': 'border-ink-muted',

    'text-[#C7C7CC]': 'text-ink-muted',
    'border-[#C7C7CC]': 'border-divider',
    'bg-[#C7C7CC]': 'bg-divider',
    
    'bg-white': 'bg-surface',
    'bg-slate-50': 'bg-panel',
    'bg-slate-100': 'bg-panel',
    'bg-slate-200': 'bg-divider',
    
    'text-slate-900': 'text-ink',
    'text-slate-800': 'text-ink',
    'text-slate-700': 'text-ink',
    'text-slate-600': 'text-ink',
    'text-slate-500': 'text-ink-muted',
    'text-slate-400': 'text-ink-muted',
    'text-slate-300': 'text-ink-muted',
    'text-slate-200': 'text-ink-muted',
    'text-slate-100': 'text-ink-muted',
    
    'border-slate-100': 'border-divider',
    'border-slate-200': 'border-divider',
    'border-slate-300': 'border-divider',
};

function processDirectory(dir) {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            processDirectory(fullPath);
        } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
            let content = fs.readFileSync(fullPath, 'utf8');
            let modified = false;
            for (const [search, replacement] of Object.entries(replacements)) {
                if (content.includes(search)) {
                    content = content.split(search).join(replacement);
                    modified = true;
                }
            }
            if (modified) {
                fs.writeFileSync(fullPath, content);
                console.log(`Updated ${fullPath}`);
            }
        }
    }
}

processDirectory('./src');

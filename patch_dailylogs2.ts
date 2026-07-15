import fs from 'fs';

const file = 'src/hooks/useDailyLogs.ts';
let code = fs.readFileSync(file, 'utf8');

code = code.replace(/materials: \[\], \n\s*labour: \[\]/g, 
`materials: (report.consumption || []).map((m: any) => ({
                       materialId: m.itemId,
                       name: m.name,
                       quantity: m.quantity,
                       unit: m.unit || ""
                   })),
                   labour: (report.labor || []).map((l: any) => ({
                       roleId: l.role,
                       roleName: l.role,
                       headcount: l.headcount
                   }))`);

fs.writeFileSync(file, code);
console.log("Patched " + file);

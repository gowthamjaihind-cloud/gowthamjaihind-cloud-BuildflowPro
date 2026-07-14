import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/components/LaborTrackingView.tsx');
let content = fs.readFileSync(file, 'utf8');

const regex = /const raBillsSummary = vendors\s*\.map\(\(vendor\) => \{[\s\S]*?\}\)\s*\.filter\(\(bill\) => bill\.grossAmount > 0\);/;

const replacement = `const billedLogIds = new Set(raBills.flatMap((b) => b.logIds || []));

    const raBillsSummary = vendors
      .map((vendor) => {
        const unbilledLogs = laborLogs.filter(
          (l) => l.vendorId === vendor.id && !billedLogIds.has(l.id)
        );
        const grossAmount = unbilledLogs.reduce((sum, l) => sum + l.totalCost, 0);
        const netPayable = grossAmount;
        return {
          vendor,
          grossAmount,
          totalPaid: 0,
          netPayable,
          logCount: unbilledLogs.length,
          logIds: unbilledLogs.map((l) => l.id),
        };
      })
      .filter((bill) => bill.grossAmount > 0);`;

if (content.match(regex)) {
  content = content.replace(regex, replacement);
  fs.writeFileSync(file, content, 'utf8');
  console.log("Fixed raBillsSummary");
} else {
  console.log("Could not find regex");
}

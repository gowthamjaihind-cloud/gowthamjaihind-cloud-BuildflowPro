import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/components/LaborTrackingView.tsx');
let content = fs.readFileSync(file, 'utf8');

const regex = /const handleDeleteRABill = async \([\s\S]*?finally \{\s*setIsProcessing\(false\);\s*\}\s*\};/m;

const match = content.match(regex);
if (match) {
  const replacement = `const handleDeleteRABill = async (billId: string) => {
    if (!billId || isProcessing) return;
    setIsProcessing(true);
    
    try {
      const billToDel = raBills.find((b) => b.id === billId);
      if (!billToDel) throw new Error("Bill not found");
      
      const ledgerEntry = ledger.find((e) => e.referenceId === billId && e.referenceType === "LABOR_DEPLOYMENT");
      
      await runTransaction(db, async (transaction) => {
        const vendorRef = doc(db, \`\${basePath}/suppliers/\${billToDel.vendorId}\`);
        const vendorDoc = await transaction.get(vendorRef);
        if (vendorDoc.exists()) {
          transaction.update(vendorRef, {
            outstandingBalance: (vendorDoc.data().outstandingBalance || 0) - billToDel.netAmount,
          });
        }
        
        if (ledgerEntry) {
          transaction.delete(doc(db, \`\${basePath}/ledger/\${ledgerEntry.id}\`));
        }
        transaction.delete(doc(db, \`\${basePath}/ra_bills/\${billId}\`));
      });
      
      queryClient.invalidateQueries({ queryKey: ["projectData", projectId] });
    } catch (error) {
      console.error("Delete RA Bill Failed:", error);
    } finally {
      setIsProcessing(false);
    }
  };`;
  content = content.replace(regex, replacement);
  fs.writeFileSync(file, content, 'utf8');
  console.log("Fixed handleDeleteRABill");
} else {
  console.log("Could not find handleDeleteRABill");
}

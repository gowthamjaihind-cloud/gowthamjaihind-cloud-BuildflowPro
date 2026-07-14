import fs from 'fs';
import path from 'path';

const file = path.join(process.cwd(), 'src/components/LaborTrackingView.tsx');
let content = fs.readFileSync(file, 'utf8');

const regex = /const handleGenerateRABill = async \([\s\S]*?finally \{\s*setIsProcessing\(false\);\s*\}\s*\};/m;

const match = content.match(regex);
if (match) {
  const replacement = `const handleGenerateRABill = async (
    vendor: Vendor,
    gross: number,
    net: number,
    logIds: string[],
  ) => {
    if (!isAdminOrOwner) return;
    if (isProcessing) return;
    setIsProcessing(true);
    
    try {
      const billNumber = \`RA-\${vendor.name.substring(0, 3).toUpperCase()}-\${Date.now().toString().slice(-4)}\`;
      
      await runTransaction(db, async (transaction) => {
        const vendorRef = doc(db, \`\${basePath}/suppliers/\${vendor.id}\`);
        const vendorDoc = await transaction.get(vendorRef);
        if (!vendorDoc.exists()) return;
        
        const billRef = doc(collection(db, \`\${basePath}/ra_bills\`));
        const ledgerRef = doc(collection(db, \`\${basePath}/ledger\`));
        
        const billData = {
          projectId,
          vendorId: vendor.id,
          vendorName: vendor.name,
          billDate: new Date().toISOString().split("T")[0],
          billNumber,
          grossAmount: gross,
          deductions: gross - net,
          netAmount: net,
          status: "Certified",
          logIds: logIds,
        };
        
        transaction.set(billRef, billData);
        
        transaction.set(ledgerRef, {
          projectId,
          vendorId: vendor.id,
          date: new Date().toISOString(),
          type: "CREDIT",
          amount: net,
          referenceType: "LABOR_DEPLOYMENT",
          referenceId: billRef.id,
          description: \`RA Bill - \${billNumber}\`,
        });
        
        transaction.update(vendorRef, {
          outstandingBalance: (vendorDoc.data().outstandingBalance || 0) + net,
        });
      });
      
      queryClient.invalidateQueries({ queryKey: ["projectData", projectId] });
      alert(\`RA Bill \${billNumber} generated successfully!\`);
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, \`\${basePath}/ra_bills\`);
    } finally {
      setIsProcessing(false);
    }
  };`;
  content = content.replace(regex, replacement);
  fs.writeFileSync(file, content, 'utf8');
  console.log("Fixed handleGenerateRABill");
} else {
  console.log("Could not find handleGenerateRABill");
}

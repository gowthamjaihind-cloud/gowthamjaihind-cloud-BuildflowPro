import * as fs from "fs";

const file = "src/components/purchase/MaterialReceiptForm.tsx";
let content = fs.readFileSync(file, "utf8");

content = content.replace(
`        transaction.update(vendorRef, {
           outstandingBalance: (vData.outstandingBalance || 0) + diff
        });

        const newReceipt: MaterialReceipt = {`,
`        transaction.update(vendorRef, {
           outstandingBalance: (vData.outstandingBalance || 0) + diff
        });

        const ledgerRef = existingReceipt?.ledgerId
            ? doc(db, \`projects/\${projectId}/ledger/\${existingReceipt.ledgerId}\`)
            : doc(collection(db, \`projects/\${projectId}/ledger\`));

        transaction.set(ledgerRef, {
            id: ledgerRef.id,
            projectId,
            vendorId: supplierId,
            date: new Date(receiptDate || "").toISOString(),
            type: "CREDIT",
            amount: totalAmount,
            referenceType: "GRN",
            referenceId: receiptId,
            description: \`Material Inward - Invoice: \${invoiceNumber}\`
        });

        const newReceipt: MaterialReceipt = {`
);

content = content.replace(
`           ledgerId: existingReceipt?.ledgerId || undefined
        };`,
`           ledgerId: ledgerRef.id
        };`
);

fs.writeFileSync(file, content);

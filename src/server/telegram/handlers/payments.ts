import {
  doc,
  getDoc,
  collection,
  query,
  getDocs,
  setDoc,
  runTransaction,
  serverTimestamp,
  orderBy,
  limit,
} from "firebase/firestore";
import { db } from "../../firebase_client.ts";
import { setSession, clearStep, BotSession } from "../session.ts";

const projPath = (orgId: string | undefined, projectId: string) =>
  orgId ? `organizations/${orgId}/projects/${projectId}` : `projects/${projectId}`;

/**
 * Checks if the Telegram user linked to this session is an Admin or Owner in BuildFlow.
 */
export async function isUserAdminOrOwner(session: BotSession | null): Promise<boolean> {
  if (!session?.userId) return false;
  try {
    const snap = await getDoc(doc(db, "users", session.userId));
    if (!snap.exists()) return false;
    const u = snap.data();
    const role = u.role || "";
    const email = u.email || "";
    return role === "Admin" || role === "Owner" || email === "gowtham.jaihind@gmail.com";
  } catch (err) {
    console.error("Error checking user role for payment command:", err);
    return false;
  }
}

/**
 * Helper to get active project details.
 */
export async function getProjectDetails(session: BotSession) {
  if (!session.activeProjectId) return null;
  const path = projPath(session.orgId, session.activeProjectId);
  const snap = await getDoc(doc(db, path));
  if (!snap.exists()) return null;
  return { id: snap.id, name: snap.data().name || "Unnamed Project", path };
}

/**
 * Main Payments Hub command: /payments
 */
export async function showPaymentsMenu(
  tg: any,
  chatId: number,
  messageId: number | null,
  session: BotSession
) {
  const isAdminOrOwner = await isUserAdminOrOwner(session);
  if (!isAdminOrOwner) {
    const text =
      "⚠️ <b>Access Restricted</b>\n\nPayment commands are reserved exclusively for Administrators and Owners.";
    if (messageId) await tg.editMessage(chatId, messageId, text);
    else await tg.sendMessage(chatId, text);
    return;
  }

  const proj = await getProjectDetails(session);
  if (!proj) {
    const text =
      "⚠️ <b>No Active Project Selected</b>\n\nPlease select an active project first by sending /projects";
    if (messageId) await tg.editMessage(chatId, messageId, text);
    else await tg.sendMessage(chatId, text);
    return;
  }

  const text = `<b>💳 Payment Management Hub</b>\nProject: <b>${proj.name}</b>\n\nSelect an operation:`;
  const buttons = [
    [{ text: "📥 Client Payment (Inward)", callback_data: "pm:client" }],
    [{ text: "📤 Vendor Payment (Outward)", callback_data: "pm:vendor" }],
    [{ text: "📊 Recent Payments Summary", callback_data: "pm:summary" }],
    [{ text: "✖ Cancel", callback_data: "xx" }],
  ];

  if (messageId) {
    await tg.editMessage(chatId, messageId, text, buttons);
  } else {
    await tg.sendMessage(chatId, text, buttons);
  }
}

/**
 * Starts the Inward Client Payment flow (/client_payment)
 */
export async function startClientPayment(
  tg: any,
  chatId: number,
  messageId: number | null,
  session: BotSession
) {
  const isAdminOrOwner = await isUserAdminOrOwner(session);
  if (!isAdminOrOwner) {
    const text =
      "⚠️ <b>Access Restricted</b>\n\nInward Client Payment commands are reserved for Admins and Owners.";
    if (messageId) await tg.editMessage(chatId, messageId, text);
    else await tg.sendMessage(chatId, text);
    return;
  }

  const proj = await getProjectDetails(session);
  if (!proj) {
    const text =
      "⚠️ <b>No Active Project</b>\n\nSend /projects to pick an active project before recording client payments.";
    if (messageId) await tg.editMessage(chatId, messageId, text);
    else await tg.sendMessage(chatId, text);
    return;
  }

  await setSession(chatId, {
    step: "pm:client_amt",
    draft: { paymentType: "CLIENT", projectId: proj.id, projectName: proj.name },
  });

  const text = `<b>📥 Inward Client Payment</b>\nProject: <b>${proj.name}</b>\n\nEnter the payment amount received from client in ₹:\n<i>Example: 50000</i>`;
  const buttons = [[{ text: "✖ Cancel", callback_data: "xx" }]];

  if (messageId) {
    await tg.editMessage(chatId, messageId, text, buttons);
  } else {
    await tg.sendMessage(chatId, text, buttons);
  }
}

/**
 * Handle amount entered for client payment
 */
export async function handleClientAmountEntered(
  tg: any,
  chatId: number,
  text: string,
  session: BotSession
) {
  const amount = parseFloat(text.replace(/,/g, ""));
  if (isNaN(amount) || amount <= 0) {
    await tg.sendMessage(chatId, "❌ Please enter a valid positive number for amount in ₹.");
    return;
  }

  const d = session.draft || {};
  await setSession(chatId, {
    draft: { ...d, amount },
  });

  const msgText = `<b>📥 Inward Client Payment</b>\nAmount: <b>₹${amount.toLocaleString("en-IN")}</b>\n\nSelect Payment Method:`;
  const buttons = [
    [
      { text: "🏦 Bank Transfer", callback_data: "pm:method:Bank Transfer" },
      { text: "📲 UPI", callback_data: "pm:method:UPI" },
    ],
    [
      { text: "📑 Cheque", callback_data: "pm:method:Cheque" },
      { text: "💵 Cash", callback_data: "pm:method:Cash" },
    ],
    [{ text: "✖ Cancel", callback_data: "xx" }],
  ];

  await tg.sendMessage(chatId, msgText, buttons);
}

/**
 * Select payment method for client payment
 */
export async function pickPaymentMethod(
  tg: any,
  chatId: number,
  messageId: number,
  session: BotSession,
  method: string
) {
  const d = session.draft || {};
  await setSession(chatId, {
    step: "pm:client_ref",
    draft: { ...d, paymentMethod: method },
  });

  const text = `<b>📥 Inward Client Payment</b>\nAmount: <b>₹${(d.amount || 0).toLocaleString("en-IN")}</b>\nMethod: <b>${method}</b>\n\nEnter Reference / Transaction ID (e.g. <code>TXN123456</code>), or tap <b>Skip Reference</b>:`;
  const buttons = [
    [{ text: "➡️ Skip Reference", callback_data: "pm:skip_ref" }],
    [{ text: "✖ Cancel", callback_data: "xx" }],
  ];

  await tg.editMessage(chatId, messageId, text, buttons);
}

/**
 * Reference handle or skip for client payment
 */
export async function handleClientReference(
  tg: any,
  chatId: number,
  refNo: string,
  messageId: number | null,
  session: BotSession
) {
  const d = session.draft || {};
  await setSession(chatId, {
    step: "pm:client_desc",
    draft: { ...d, referenceNumber: refNo || "" },
  });

  const text = `<b>📥 Inward Client Payment</b>\nAmount: <b>₹${(d.amount || 0).toLocaleString("en-IN")}</b>\nMethod: <b>${d.paymentMethod || "Bank Transfer"}</b>\nRef: <b>${refNo || "None"}</b>\n\nEnter Description / Remarks (e.g. <code>Milestone 2 Advance</code>), or tap <b>Skip Description</b>:`;
  const buttons = [
    [{ text: "➡️ Skip Description", callback_data: "pm:skip_desc" }],
    [{ text: "✖ Cancel", callback_data: "xx" }],
  ];

  if (messageId) {
    await tg.editMessage(chatId, messageId, text, buttons);
  } else {
    await tg.sendMessage(chatId, text, buttons);
  }
}

/**
 * Description handle or skip for client payment -> Confirmation Screen
 */
export async function handleClientDescription(
  tg: any,
  chatId: number,
  desc: string,
  messageId: number | null,
  session: BotSession
) {
  const d = session.draft || {};
  const finalDesc = desc || "Inward Client Payment via Telegram";
  await setSession(chatId, {
    step: null,
    draft: { ...d, description: finalDesc },
  });

  const text =
    `<b>📥 Confirm Inward Client Payment</b>\n\n` +
    `Project: <b>${d.projectName || "Active Project"}</b>\n` +
    `Amount: <b>₹${(d.amount || 0).toLocaleString("en-IN")}</b>\n` +
    `Method: <b>${d.paymentMethod || "Bank Transfer"}</b>\n` +
    `Ref No: <b>${d.referenceNumber || "None"}</b>\n` +
    `Description: <b>${finalDesc}</b>\n\n` +
    `Save this payment record?`;

  const buttons = [
    [{ text: "✅ Confirm & Save Client Payment", callback_data: "pm:save_client" }],
    [{ text: "✖ Cancel", callback_data: "xx" }],
  ];

  if (messageId) {
    await tg.editMessage(chatId, messageId, text, buttons);
  } else {
    await tg.sendMessage(chatId, text, buttons);
  }
}

/**
 * Save client payment to Firestore
 */
export async function saveClientPayment(
  tg: any,
  chatId: number,
  messageId: number,
  session: BotSession
) {
  const d = session.draft || {};
  if (!d.amount || !session.activeProjectId) {
    await tg.editMessage(
      chatId,
      messageId,
      "❌ Payment details expired. Please try again with /client_payment."
    );
    return;
  }

  const base = projPath(session.orgId, session.activeProjectId);
  const docRef = doc(collection(db, `${base}/client_payments`));

  const payload = {
    id: docRef.id,
    projectId: session.activeProjectId,
    date: new Date().toISOString().split("T")[0],
    amount: Number(d.amount),
    referenceNumber: d.referenceNumber || "",
    description: d.description || "Inward Client Payment via Telegram",
    paymentMethod: d.paymentMethod || "Bank Transfer",
    createdBy: session.email || "Telegram Admin",
    createdAt: serverTimestamp(),
  };

  try {
    await setDoc(docRef, payload);
    await clearStep(chatId);

    const successText =
      `✅ <b>Inward Client Payment Recorded!</b>\n\n` +
      `<b>Project:</b> ${d.projectName || "Active Project"}\n` +
      `<b>Amount Received:</b> ₹${Number(d.amount).toLocaleString("en-IN")}\n` +
      `<b>Method:</b> ${payload.paymentMethod}\n` +
      `<b>Ref No:</b> ${payload.referenceNumber || "None"}\n` +
      `<b>Date:</b> ${payload.date}`;

    await tg.editMessage(chatId, messageId, successText);
  } catch (err) {
    console.error("Failed to save client payment via Telegram:", err);
    await tg.editMessage(chatId, messageId, "❌ Failed to save client payment. Please try again.");
  }
}

/**
 * Starts the Outward Vendor Payment flow (/vendor_payment)
 */
export async function startVendorPayment(
  tg: any,
  chatId: number,
  messageId: number | null,
  session: BotSession
) {
  const isAdminOrOwner = await isUserAdminOrOwner(session);
  if (!isAdminOrOwner) {
    const text =
      "⚠️ <b>Access Restricted</b>\n\nOutward Vendor Payment commands are reserved for Admins and Owners.";
    if (messageId) await tg.editMessage(chatId, messageId, text);
    else await tg.sendMessage(chatId, text);
    return;
  }

  const proj = await getProjectDetails(session);
  if (!proj) {
    const text =
      "⚠️ <b>No Active Project</b>\n\nSend /projects to pick an active project before recording vendor payments.";
    if (messageId) await tg.editMessage(chatId, messageId, text);
    else await tg.sendMessage(chatId, text);
    return;
  }

  const base = projPath(session.orgId, session.activeProjectId);
  const vendorsSnap = await getDocs(collection(db, `${base}/suppliers`));

  if (vendorsSnap.empty) {
    const text = `⚠️ <b>No Vendors Found</b>\n\nThere are no vendors/suppliers configured for <b>${proj.name}</b>. Please add vendors in the web app first.`;
    if (messageId) await tg.editMessage(chatId, messageId, text);
    else await tg.sendMessage(chatId, text);
    return;
  }

  const buttons: any[] = [];
  vendorsSnap.docs.forEach((vDoc) => {
    const v = vDoc.data();
    const name = v.name || "Unknown Vendor";
    const bal = v.outstandingBalance || 0;
    buttons.push([
      {
        text: `🏢 ${name} (Bal: ₹${bal.toLocaleString("en-IN")})`,
        callback_data: `pm:vsel:${vDoc.id}`,
      },
    ]);
  });
  buttons.push([{ text: "✖ Cancel", callback_data: "xx" }]);

  const text = `<b>📤 Outward Vendor Payment</b>\nProject: <b>${proj.name}</b>\n\nSelect Vendor/Supplier to pay:`;

  if (messageId) {
    await tg.editMessage(chatId, messageId, text, buttons);
  } else {
    await tg.sendMessage(chatId, text, buttons);
  }
}

/**
 * Vendor selected for outward payment
 */
export async function pickVendor(
  tg: any,
  chatId: number,
  messageId: number,
  session: BotSession,
  vendorId: string
) {
  if (!session.activeProjectId) return;
  const base = projPath(session.orgId, session.activeProjectId);
  const vSnap = await getDoc(doc(db, `${base}/suppliers/${vendorId}`));

  if (!vSnap.exists()) {
    await tg.editMessage(chatId, messageId, "❌ Vendor not found.");
    return;
  }

  const vendor = vSnap.data();
  const vName = vendor.name || "Unknown Vendor";
  const currentBal = vendor.outstandingBalance || 0;

  await setSession(chatId, {
    step: "pm:vendor_amt",
    draft: {
      paymentType: "VENDOR",
      vendorId,
      vendorName: vName,
      vendorBalance: currentBal,
    },
  });

  const text = `<b>Outward Payment to ${vName}</b>\nCurrent Outstanding Balance: <b>₹${currentBal.toLocaleString("en-IN")}</b>\n\nEnter payment amount in ₹:\n<i>Example: 25000</i>`;
  const buttons = [[{ text: "✖ Cancel", callback_data: "xx" }]];

  await tg.editMessage(chatId, messageId, text, buttons);
}

/**
 * Handle amount entered for vendor payment
 */
export async function handleVendorAmountEntered(
  tg: any,
  chatId: number,
  text: string,
  session: BotSession
) {
  const amount = parseFloat(text.replace(/,/g, ""));
  if (isNaN(amount) || amount <= 0) {
    await tg.sendMessage(chatId, "❌ Please enter a valid positive number for payment amount in ₹.");
    return;
  }

  const d = session.draft || {};
  await setSession(chatId, {
    step: "pm:vendor_desc",
    draft: { ...d, amount },
  });

  const msgText = `<b>Outward Payment to ${d.vendorName}</b>\nAmount: <b>₹${amount.toLocaleString("en-IN")}</b>\n\nEnter Description / Remarks (e.g. <code>Advance for TMT Steel</code>), or tap <b>Skip Description</b>:`;
  const buttons = [
    [{ text: "➡️ Skip Description", callback_data: "pm:vskip_desc" }],
    [{ text: "✖ Cancel", callback_data: "xx" }],
  ];

  await tg.sendMessage(chatId, msgText, buttons);
}

/**
 * Description handle or skip for vendor payment -> Confirmation Screen
 */
export async function handleVendorDescription(
  tg: any,
  chatId: number,
  desc: string,
  messageId: number | null,
  session: BotSession
) {
  const d = session.draft || {};
  const finalDesc = desc || "Payment to Vendor via Telegram";
  const currentBal = d.vendorBalance || 0;
  const newBal = currentBal - (d.amount || 0);

  await setSession(chatId, {
    step: null,
    draft: { ...d, description: finalDesc, newBalance: newBal },
  });

  const text =
    `<b>📤 Confirm Outward Vendor Payment</b>\n\n` +
    `Vendor: <b>${d.vendorName || "Vendor"}</b>\n` +
    `Payment Amount: <b>₹${(d.amount || 0).toLocaleString("en-IN")}</b>\n` +
    `Current Outstanding: <b>₹${currentBal.toLocaleString("en-IN")}</b>\n` +
    `New Expected Balance: <b>₹${newBal.toLocaleString("en-IN")}</b>\n` +
    `Description: <b>${finalDesc}</b>\n\n` +
    `Proceed with vendor payment record?`;

  const buttons = [
    [{ text: "✅ Confirm Outward Payment", callback_data: "pm:save_vendor" }],
    [{ text: "✖ Cancel", callback_data: "xx" }],
  ];

  if (messageId) {
    await tg.editMessage(chatId, messageId, text, buttons);
  } else {
    await tg.sendMessage(chatId, text, buttons);
  }
}

/**
 * Save vendor outward payment to Firestore transaction
 */
export async function saveVendorPayment(
  tg: any,
  chatId: number,
  messageId: number,
  session: BotSession
) {
  const d = session.draft || {};
  if (!d.amount || !d.vendorId || !session.activeProjectId) {
    await tg.editMessage(
      chatId,
      messageId,
      "❌ Payment details expired. Please try again with /vendor_payment."
    );
    return;
  }

  const base = projPath(session.orgId, session.activeProjectId);

  try {
    let newBalance = 0;
    await runTransaction(db, async (transaction) => {
      const vendorRef = doc(db, `${base}/suppliers/${d.vendorId}`);
      const vendorDoc = await transaction.get(vendorRef);
      if (!vendorDoc.exists()) {
        throw new Error("Vendor no longer exists");
      }

      const currentBal = vendorDoc.data().outstandingBalance || 0;
      newBalance = currentBal - Number(d.amount);

      const ledgerRef = doc(collection(db, `${base}/ledger`));

      transaction.set(ledgerRef, {
        id: ledgerRef.id,
        projectId: session.activeProjectId,
        vendorId: d.vendorId,
        date: new Date().toISOString(),
        type: "DEBIT",
        amount: Number(d.amount),
        referenceType: "PAYMENT",
        description: d.description || "Payment to Vendor via Telegram",
        createdBy: session.email || "Telegram Admin",
      });

      transaction.update(vendorRef, {
        outstandingBalance: newBalance,
      });
    });

    await clearStep(chatId);

    const successText =
      `✅ <b>Outward Vendor Payment Recorded!</b>\n\n` +
      `<b>Vendor:</b> ${d.vendorName}\n` +
      `<b>Amount Paid:</b> ₹${Number(d.amount).toLocaleString("en-IN")}\n` +
      `<b>New Outstanding Balance:</b> ₹${newBalance.toLocaleString("en-IN")}\n` +
      `<b>Description:</b> ${d.description}`;

    await tg.editMessage(chatId, messageId, successText);
  } catch (err: any) {
    console.error("Failed to save vendor payment via Telegram:", err);
    await tg.editMessage(
      chatId,
      messageId,
      `❌ Transaction failed: ${err.message || "Error updating ledger."}`
    );
  }
}

/**
 * Show summary of recent payments (/payments -> Summary)
 */
export async function showPaymentSummary(
  tg: any,
  chatId: number,
  messageId: number | null,
  session: BotSession
) {
  const isAdminOrOwner = await isUserAdminOrOwner(session);
  if (!isAdminOrOwner) {
    const text = "⚠️ <b>Access Restricted</b>\n\nPayment summary is reserved for Admins and Owners.";
    if (messageId) await tg.editMessage(chatId, messageId, text);
    else await tg.sendMessage(chatId, text);
    return;
  }

  const proj = await getProjectDetails(session);
  if (!proj) {
    const text = "⚠️ <b>No Active Project Selected</b>\n\nPlease select a project using /projects first.";
    if (messageId) await tg.editMessage(chatId, messageId, text);
    else await tg.sendMessage(chatId, text);
    return;
  }

  const base = projPath(session.orgId, session.activeProjectId);

  try {
    const clientSnap = await getDocs(
      query(collection(db, `${base}/client_payments`), orderBy("date", "desc"), limit(5))
    );
    const ledgerSnap = await getDocs(
      query(collection(db, `${base}/ledger`), orderBy("date", "desc"), limit(20))
    );

    let totalClientIn = 0;
    const clientRecords = clientSnap.docs.map((docSnap) => {
      const data = docSnap.data();
      totalClientIn += data.amount || 0;
      return `• ₹${(data.amount || 0).toLocaleString("en-IN")} on ${data.date || ""} (${data.paymentMethod || "Bank"})`;
    });

    let totalVendorOut = 0;
    const vendorRecords: string[] = [];
    ledgerSnap.docs.forEach((docSnap) => {
      const data = docSnap.data();
      if (data.type === "DEBIT") {
        totalVendorOut += data.amount || 0;
        if (vendorRecords.length < 5) {
          const dateStr = data.date ? data.date.split("T")[0] : "";
          vendorRecords.push(`• ₹${(data.amount || 0).toLocaleString("en-IN")} on ${dateStr} - ${data.description || "Vendor Payment"}`);
        }
      }
    });

    let text = `<b>📊 Payment Summary for ${proj.name}</b>\n\n`;
    text += `<b>📥 Recent Inward Client Payments:</b>\n`;
    if (clientRecords.length === 0) {
      text += `<i>No client payments recorded yet.</i>\n`;
    } else {
      text += clientRecords.join("\n") + "\n";
    }

    text += `\n<b>📤 Recent Outward Vendor Payments:</b>\n`;
    if (vendorRecords.length === 0) {
      text += `<i>No vendor payments recorded yet.</i>\n`;
    } else {
      text += vendorRecords.join("\n") + "\n";
    }

    text += `\n<b>Total Client Inward:</b> ₹${totalClientIn.toLocaleString("en-IN")}\n`;
    text += `<b>Total Vendor Outward:</b> ₹${totalVendorOut.toLocaleString("en-IN")}`;

    const buttons = [
      [{ text: "💳 Back to Payment Hub", callback_data: "pm:menu" }],
      [{ text: "✖ Close", callback_data: "xx" }],
    ];

    if (messageId) {
      await tg.editMessage(chatId, messageId, text, buttons);
    } else {
      await tg.sendMessage(chatId, text, buttons);
    }
  } catch (err) {
    console.error("Error fetching payment summary:", err);
    const text = "❌ Error retrieving payment summary.";
    if (messageId) await tg.editMessage(chatId, messageId, text);
    else await tg.sendMessage(chatId, text);
  }
}

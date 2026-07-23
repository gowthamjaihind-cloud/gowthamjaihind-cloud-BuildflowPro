import re
with open("firestore.rules", "r") as f:
    text = f.read()

text = text.replace(
"""    match /projects/{projectId} {
      allow read, write: if request.auth != null;
    }""",
"""    match /projects/{projectId} {
      allow read, write: if request.auth != null;
      match /{collection}/{docId} {
        allow read, write: if request.auth != null && collection != 'dailyLogs' && collection != 'purchase_orders' && collection != 'goodsReceiptNotes' && collection != 'system' && collection != 'ledger' && collection != 'ra_bills' && collection != 'labor_rate_cards' && collection != 'client_payments' && collection != 'documents' && collection != 'estimates';
      }
    }"""
)

with open("firestore.rules", "w") as f:
    f.write(text)

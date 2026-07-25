"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.db = exports.FIRESTORE_DATABASE_ID = void 0;
const firestore_1 = require("firebase-admin/firestore");
/**
 * The web app stores all data in a NAMED Firestore database
 * (see firebase-applet-config.json -> firestoreDatabaseId), not "(default)".
 *
 * admin.firestore() binds to "(default)", which is a different, empty database —
 * so the bot would never find link codes, sessions or users written by the app.
 * Every Firestore access in the bot must go through this shared instance.
 */
exports.FIRESTORE_DATABASE_ID = process.env.FIRESTORE_DATABASE_ID ||
    "ai-studio-97ffdc85-b348-4a76-9ede-baa3db65adee";
exports.db = (0, firestore_1.getFirestore)(exports.FIRESTORE_DATABASE_ID);
// Matches the web app's client config so writes with undefined fields don't throw.
exports.db.settings({ ignoreUndefinedProperties: true });
//# sourceMappingURL=db.js.map
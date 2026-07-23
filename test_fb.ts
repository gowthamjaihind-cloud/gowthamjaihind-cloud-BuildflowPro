import { authPromise } from "./src/server/firebase_client";
authPromise.then(() => { console.log("Done"); process.exit(0); });

import { initializeApp } from "firebase/app";
import { getAuth, signInAnonymously } from "firebase/auth";
import { getStorage, ref, uploadBytes } from "firebase/storage";
import firebaseConfig from "./firebase-applet-config.json" with { type: "json" };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const storage = getStorage(app);

signInAnonymously(auth).then(async () => {
    try {
        const dummyData = new Uint8Array([0x00, 0x01]);
        const sRef = ref(storage, "test_upload.jpg");
        await uploadBytes(sRef, dummyData, { contentType: "image/jpeg" });
        console.log("Upload success!");
    } catch (e: any) {
        console.error("Upload error:", e.message);
    }
    process.exit(0);
});

import { onDocumentWritten } from "firebase-functions/v2/firestore";
import { db, FIRESTORE_DATABASE_ID } from "../db";

/**
 * Keeps organizations/{orgId}.projectCount equal to the number of projects.
 *
 * The plan's project limit was only checked in the app: an Owner or Admin
 * writing to the database directly could create any number of projects on a
 * one-project plan. Security rules cannot count documents, but they can read a
 * number, so this trigger maintains the number and firestore.rules refuses a
 * create once it reaches the plan's cap (see underProjectCap there).
 *
 * projectCount is not in the fields a client may write on an org, so it cannot
 * be forged. The count is re-read on every create and delete rather than
 * incremented, so a missed event cannot leave it permanently wrong.
 */
export const onOrgProjectWritten = onDocumentWritten(
  {
    document: "organizations/{orgId}/projects/{projectId}",
    database: FIRESTORE_DATABASE_ID,
  },
  async (event: any) => {
    const before = event.data?.before?.exists;
    const after = event.data?.after?.exists;
    if (before === after) return; // an edit: the count has not changed
    const orgRef = db.doc(`organizations/${event.params.orgId}`);
    const count = (await orgRef.collection("projects").count().get()).data().count;
    await orgRef.update({ projectCount: count }).catch((e) => console.error("projectCount update failed", event.params.orgId, e));
  },
);

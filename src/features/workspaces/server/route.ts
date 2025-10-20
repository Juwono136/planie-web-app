import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { createWorkspaceSchema } from "../schemas";
import { sessionMiddleware } from "@/lib/session-middleware";
import { DATABASE_ID, IMAGES_BUCKET_ID, WORKSPACES_ID } from "@/config";
import { ID } from "node-appwrite";

const app = new Hono().post(
  "/",
  zValidator("form", createWorkspaceSchema),
  sessionMiddleware,
  async (c) => {
    const databases = c.get("databases");
    const storage = c.get("storage");
    const user = c.get("user");

    const { name, image } = c.req.valid("form");

    let uploadImageUrl: string | undefined;

    if (image instanceof File) {
      const file = await storage.createFile({
        bucketId: IMAGES_BUCKET_ID,
        fileId: ID.unique(),
        file: image,
      });

      const arrayBuffer = await storage.getFileView({
        bucketId: IMAGES_BUCKET_ID,
        fileId: file.$id,
      });

      uploadImageUrl = `data:image/png;base64,${Buffer.from(arrayBuffer).toString("base64")}`;
    }

    const workspace = await databases.createDocument({
      databaseId: DATABASE_ID,
      collectionId: WORKSPACES_ID,
      documentId: ID.unique(),
      data: {
        name,
        userId: user.$id,
        imageUrl: uploadImageUrl,
      },
    });

    return c.json({ data: workspace });
  }
);

export default app;

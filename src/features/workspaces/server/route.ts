import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { createWorkspaceSchema } from "../schemas";
import { sessionMiddleware } from "@/lib/session-middleware";
import { DATABASE_ID, IMAGES_BUCKET_ID, MEMBERS_ID, WORKSPACES_ID } from "@/config";
import { ID, Query } from "node-appwrite";
import { MemberRoles } from "@/features/members/types";
import { generateInviteCode } from "@/lib/utils";

const app = new Hono()
  .get("/", sessionMiddleware, async (c) => {
    const user = c.get("user");
    const databases = c.get("databases");

    const members = await databases.listDocuments({
      databaseId: DATABASE_ID,
      collectionId: MEMBERS_ID,
      queries: [Query.equal("userId", user.$id)],
    });

    if (members.total === 0) {
      return c.json({ data: { documents: [], total: 0 } });
    }

    const workspaceIds = members.documents.map((member) => member.workspaceId);

    const workspaces = await databases.listDocuments({
      databaseId: DATABASE_ID,
      collectionId: WORKSPACES_ID,
      queries: [Query.orderDesc("$createdAt"), Query.contains("$id", workspaceIds)],
    });

    return c.json({ data: workspaces });
  })
  .post("/", zValidator("form", createWorkspaceSchema), sessionMiddleware, async (c) => {
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
        inviteCode: generateInviteCode(6),
      },
    });

    await databases.createDocument({
      databaseId: DATABASE_ID,
      collectionId: MEMBERS_ID,
      documentId: ID.unique(),
      data: {
        userId: user.$id,
        workspaceId: workspace.$id,
        role: MemberRoles.ADMIN,
      },
    });

    return c.json({ data: workspace });
  });

export default app;

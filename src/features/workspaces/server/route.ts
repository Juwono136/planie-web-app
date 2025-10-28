import { zValidator } from "@hono/zod-validator";
import { Hono } from "hono";
import { createWorkspaceSchema, updateWorkspaceSchema } from "../schemas";
import { sessionMiddleware } from "@/lib/session-middleware";
import { DATABASE_ID, IMAGES_BUCKET_ID, MEMBERS_ID, WORKSPACES_ID } from "@/config";
import { ID, Query } from "node-appwrite";
import { MemberRoles } from "@/features/members/types";
import { generateInviteCode } from "@/lib/utils";
import { getMember } from "@/features/members/utils";
import z from "zod";
import { Workspace } from "../types";

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
  })
  .patch(
    "/:workspaceId",
    sessionMiddleware,
    zValidator("form", updateWorkspaceSchema),
    async (c) => {
      const databases = c.get("databases");
      const storage = c.get("storage");
      const user = c.get("user");

      const { workspaceId } = c.req.param();
      const { name, image } = c.req.valid("form");

      const member = await getMember({
        databases,
        workspaceId,
        userId: user.$id,
      });

      if (!member || member.role !== MemberRoles.ADMIN) {
        return c.json({ error: "Unauthorized" }, 401);
      }

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
      } else {
        uploadImageUrl = image;
      }

      const workspace = await databases.updateDocument(DATABASE_ID, WORKSPACES_ID, workspaceId, {
        name,
        imageUrl: uploadImageUrl,
      });

      return c.json({ data: workspace });
    }
  )
  .delete("/:workspaceId", sessionMiddleware, async (c) => {
    const databases = c.get("databases");
    const user = c.get("user");

    const { workspaceId } = c.req.param();

    const member = await getMember({
      databases,
      workspaceId,
      userId: user.$id,
    });

    if (!member || member.role !== MemberRoles.ADMIN) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    // TODO: Delete members, projects, and tasks

    await databases.deleteDocument({
      databaseId: DATABASE_ID,
      collectionId: WORKSPACES_ID,
      documentId: workspaceId,
    });

    return c.json({ data: { $id: workspaceId } });
  })
  .post("/:workspaceId/reset-invite-code", sessionMiddleware, async (c) => {
    const databases = c.get("databases");
    const user = c.get("user");

    const { workspaceId } = c.req.param();

    const member = await getMember({
      databases,
      workspaceId,
      userId: user.$id,
    });

    if (!member || member.role !== MemberRoles.ADMIN) {
      return c.json({ error: "Unauthorized" }, 401);
    }

    const workspace = await databases.updateDocument({
      databaseId: DATABASE_ID,
      collectionId: WORKSPACES_ID,
      documentId: workspaceId,
      data: {
        inviteCode: generateInviteCode(6),
      },
    });

    return c.json({ data: workspace });
  })
  .post(
    "/:workspaceId/join",
    sessionMiddleware,
    zValidator("json", z.object({ code: z.string() })),
    async (c) => {
      const { workspaceId } = c.req.param();
      const { code } = c.req.valid("json");

      const databases = c.get("databases");
      const user = c.get("user");

      const member = await getMember({
        databases,
        workspaceId,
        userId: user.$id,
      });

      if (member) {
        return c.json({ error: "Already a member" }, 400);
      }

      const workspace = await databases.getDocument<Workspace>({
        databaseId: DATABASE_ID,
        collectionId: WORKSPACES_ID,
        documentId: workspaceId,
      });

      if (workspace.inviteCode !== code) {
        return c.json({ error: "Invalid invite code" }, 400);
      }

      await databases.createDocument({
        databaseId: DATABASE_ID,
        collectionId: MEMBERS_ID,
        documentId: ID.unique(),
        data: {
          workspaceId,
          userId: user.$id,
          role: MemberRoles.MEMBER,
        },
      });

      return c.json({ data: workspace });
    }
  );

export default app;

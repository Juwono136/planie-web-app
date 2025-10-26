import { Query } from "node-appwrite";
import { DATABASE_ID, MEMBERS_ID, WORKSPACES_ID } from "@/config";
import { getMember } from "../members/utils";
import { Workspace } from "./types";
import { createSessionClient } from "@/lib/appwrite";

export const getWorkspaces = async () => {
  try {
    const { databases, account } = await createSessionClient();
    const user = await account.get();

    const members = await databases.listDocuments({
      databaseId: DATABASE_ID,
      collectionId: MEMBERS_ID,
      queries: [Query.equal("userId", user.$id)],
    });

    if (members.total === 0) {
      return { documents: [], total: 0 };
    }

    const workspaceIds = members.documents.map((member) => member.workspaceId);

    const workspaces = await databases.listDocuments({
      databaseId: DATABASE_ID,
      collectionId: WORKSPACES_ID,
      queries: [Query.orderDesc("$createdAt"), Query.contains("$id", workspaceIds)],
    });

    return workspaces;
  } catch {
    return { documents: [], total: 0 };
  }
};

interface GetWorkSpaceProps {
  workspaceId: string;
}

export const getWorkspace = async ({ workspaceId }: GetWorkSpaceProps) => {
  try {
    const { databases, account } = await createSessionClient();
    const user = await account.get();

    const member = await getMember({
      databases,
      userId: user.$id,
      workspaceId,
    });

    if (!member) {
      return null;
    }

    const workspace = await databases.getDocument<Workspace>({
      databaseId: DATABASE_ID,
      collectionId: WORKSPACES_ID,
      documentId: workspaceId,
    });

    return workspace;
  } catch {
    return null;
  }
};

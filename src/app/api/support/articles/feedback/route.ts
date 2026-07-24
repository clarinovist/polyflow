import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { getMainPrisma } from "@/lib/core/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    articleId?: string;
    vote?: "UP" | "DOWN";
  } | null;

  const { articleId, vote } = body || {};

  if (!articleId || !vote || !["UP", "DOWN"].includes(vote)) {
    return NextResponse.json(
      { success: false, error: "articleId and vote (UP|DOWN) are required." },
      { status: 400 }
    );
  }

  try {
    const mainDb = getMainPrisma();

    const article = await mainDb.helpArticle.findUnique({
      where: { id: articleId },
      select: { id: true },
    });

    if (!article) {
      return NextResponse.json({ success: false, error: "Article not found." }, { status: 404 });
    }

    if (vote === "UP") {
      await mainDb.helpArticle.update({
        where: { id: articleId },
        data: { helpfulCount: { increment: 1 } },
      });
    } else {
      await mainDb.helpArticle.update({
        where: { id: articleId },
        data: { notHelpfulCount: { increment: 1 } },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[ARTICLE_FEEDBACK] Failed:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save feedback." },
      { status: 500 }
    );
  }
}

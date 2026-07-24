import { auth } from "@/auth";
import { NextRequest, NextResponse } from "next/server";
import { getMainPrisma } from "@/lib/core/prisma";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const userId = (session.user as { id?: string }).id;
  if (!userId) {
    return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    interactionId?: string;
    feedback?: "UP" | "DOWN";
  } | null;

  const { interactionId, feedback } = body || {};

  if (!interactionId || !feedback || !["UP", "DOWN"].includes(feedback)) {
    return NextResponse.json(
      { success: false, error: "interactionId and feedback (UP|DOWN) are required." },
      { status: 400 }
    );
  }

  try {
    const mainDb = getMainPrisma();

    const interaction = await mainDb.helpInteraction.findUnique({
      where: { id: interactionId },
      select: { id: true, userId: true, tenantId: true },
    });

    if (!interaction) {
      return NextResponse.json({ success: false, error: "Interaction not found." }, { status: 404 });
    }

    // Strict ownership: null owner → 403 (no anonymous feedback)
    if (!interaction.userId) {
      return NextResponse.json({ success: false, error: "Forbidden. Anonymous feedback not allowed." }, { status: 403 });
    }
    if (interaction.userId !== userId) {
      return NextResponse.json({ success: false, error: "Forbidden." }, { status: 403 });
    }

    await mainDb.helpInteraction.update({
      where: { id: interactionId },
      data: { feedback },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[FEEDBACK] Failed:", error);
    return NextResponse.json(
      { success: false, error: "Failed to save feedback." },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id, taskId } = await params;
  const body = await req.json();

  const [updated] = await db
    .update(tasks)
    .set({ ...body, updatedAt: new Date() })
    .where(and(eq(tasks.id, taskId), eq(tasks.projectId, id)))
    .returning();

  if (!updated) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (body.status) {
    Sentry.metrics.count("task.status_change", 1, {
      attributes: { status: updated.status, priority: updated.priority },
    });
  }

  return NextResponse.json({
    id: updated.id,
    projectId: updated.projectId,
    title: updated.title,
    description: updated.description,
    status: updated.status,
    priority: updated.priority,
    output: updated.output,
    createdAt: updated.createdAt.toISOString(),
    updatedAt: updated.updatedAt.toISOString(),
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> }
) {
  const { id, taskId } = await params;

  await db
    .delete(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.projectId, id)));

  Sentry.metrics.count("task.deleted", 1);

  return NextResponse.json({ success: true });
}

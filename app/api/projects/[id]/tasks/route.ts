import { NextRequest, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { db } from "@/lib/db";
import { tasks } from "@/lib/db/schema";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // In Next.js 15 App Router, `params` is a Promise and MUST be awaited
  // before destructuring. Accessing it synchronously would yield
  // `projectId === undefined`, which Drizzle then renders as DEFAULT in
  // the INSERT and triggers a NOT NULL violation on tasks.project_id
  // (see Sentry issue AGENTBOARD-1).
  const { id: projectId } = await params;

  // Defensive guard so a malformed/missing dynamic segment returns a
  // clean 400 instead of crashing inside the DB layer.
  if (!projectId || typeof projectId !== "string") {
    return NextResponse.json(
      { error: "Missing or invalid projectId in route params" },
      { status: 400 }
    );
  }

  const body = await req.json();

  if (!body?.title || typeof body.title !== "string") {
    return NextResponse.json(
      { error: "Missing required field: title" },
      { status: 400 }
    );
  }

  try {
    const [task] = await db
      .insert(tasks)
      .values({
        projectId,
        title: body.title,
        description: body.description || "",
        status: body.status || "todo",
        priority: body.priority || "medium",
        output: body.output || "",
      })
      .returning();

    Sentry.logger.info(
      Sentry.logger.fmt`Task created: ${task.title}`,
      {
        taskId: task.id,
        projectId: task.projectId,
        title: task.title,
        status: task.status,
        priority: task.priority,
      }
    );

    Sentry.metrics.count("task.created", 1, {
      attributes: { priority: task.priority, status: task.status },
    });

    return NextResponse.json({
      id: task.id,
      projectId: task.projectId,
      title: task.title,
      description: task.description,
      status: task.status,
      priority: task.priority,
      output: task.output,
      createdAt: task.createdAt.toISOString(),
      updatedAt: task.updatedAt.toISOString(),
    });
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "POST /api/projects/[id]/tasks" },
      extra: { projectId },
    });
    return NextResponse.json(
      { error: "Failed to create task" },
      { status: 500 }
    );
  }
}

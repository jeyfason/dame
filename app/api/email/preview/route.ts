import { NextResponse } from "next/server";
import { renderInviteHtml, renderResultHtml } from "@/emails/render";

// Dev-only template preview: renders InviteEmail / ResultEmail to HTML.
// Fail-closed outside development (preview must never leak in prod).

function devGate(): Response | null {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return null;
}

export function renderPreview(
  template: unknown,
  props: Record<string, unknown> = {},
): string | null {
  if (template === "invite") {
    return renderInviteHtml(
      props as Partial<Parameters<typeof renderInviteHtml>[0]>,
    );
  }
  if (template === "result") {
    return renderResultHtml(
      props as Partial<Parameters<typeof renderResultHtml>[0]>,
    );
  }
  return null;
}

function htmlResponse(html: string | null): Response {
  if (!html) {
    return NextResponse.json(
      { error: "template must be invite|result" },
      { status: 400 },
    );
  }
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export async function POST(req: Request) {
  const gated = devGate();
  if (gated) return gated;
  let body: Record<string, unknown> = {};
  try {
    const text = await req.text();
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const props =
    body.props && typeof body.props === "object"
      ? (body.props as Record<string, unknown>)
      : {};
  return htmlResponse(renderPreview(body.template, props));
}

export async function GET(req: Request) {
  const gated = devGate();
  if (gated) return gated;
  const template = new URL(req.url).searchParams.get("template");
  return htmlResponse(renderPreview(template));
}

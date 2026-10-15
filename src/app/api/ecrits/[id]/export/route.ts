import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth/guard";
import { requestMeta } from "@/lib/auth/session";
import { AppError } from "@/lib/errors";
import { logExport, prepareExport } from "@/lib/services/documents";
import { buildExportModel } from "@/lib/export/model";
import { renderPdf } from "@/lib/export/pdf";
import { renderDocx } from "@/lib/export/docx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Authentification requise." }, { status: 401 });
  // L'export modifie l'état du document : refus des requêtes initiées depuis un autre site
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return NextResponse.json({ error: "Requête refusée." }, { status: 403 });
  }
  const { id } = await params;
  const format = req.nextUrl.searchParams.get("format");
  const mode = req.nextUrl.searchParams.get("mode");
  if ((format !== "pdf" && format !== "docx") || (mode !== "final" && mode !== "draft")) {
    return NextResponse.json({ error: "Paramètres d'export invalides." }, { status: 400 });
  }
  const meta = await requestMeta();
  try {
    const { ws, org } = await prepareExport(user, id, mode);
    const model = buildExportModel({
      mode,
      org,
      doc: {
        type: ws.type,
        status: mode === "final" ? "EXPORTED" : ws.status,
        caseReference: ws.caseReference,
        authorName: ws.authorName,
        authorJobTitle: ws.input.authorJobTitle,
        serviceName: ws.input.serviceName,
        meetingDate: ws.input.meetingDate,
        recipient: ws.input.recipient,
        currentVersion: ws.currentVersion,
        createdAt: ws.createdAt,
        updatedAt: ws.updatedAt,
        validatedAt: ws.validatedAt,
        validatorName: ws.validator?.fullName ?? null,
      },
      content: ws.content!,
    });
    const body = format === "pdf" ? await renderPdf(model) : await renderDocx(model);
    await logExport(user, id, mode, format, ws.currentVersion, meta.ip);
    const base = `${ws.caseReference.replace(/[^A-Za-z0-9-]/g, "_")}_${ws.type.toLowerCase()}_v${ws.currentVersion}${mode === "draft" ? "_BROUILLON" : ""}`;
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "Content-Type": format === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${base}.${format}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof AppError) {
      const status = e.code === "NOT_FOUND" ? 404 : e.code === "FORBIDDEN" ? 403 : e.code === "CONFLICT" ? 409 : 400;
      return NextResponse.json({ error: e.message }, { status });
    }
    console.error("[export]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Export impossible." }, { status: 500 });
  }
}

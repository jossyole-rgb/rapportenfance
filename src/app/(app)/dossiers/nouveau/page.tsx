import type { Metadata } from "next";
import { requireCaseUser } from "@/lib/auth/guard";
import { Card, CardBody, PageHeader } from "@/components/ui/card";
import { CaseFileForm } from "./case-file-form";

export const metadata: Metadata = { title: "Nouveau dossier" };

export default async function NewCaseFilePage({ searchParams }: { searchParams: Promise<{ then?: string }> }) {
  const user = await requireCaseUser();
  const { then } = await searchParams;
  return (
    <div className="max-w-2xl">
      <PageHeader title="Nouveau dossier" description="Vous serez automatiquement membre de ce dossier. Vous pourrez ensuite y ajouter des collègues." />
      <Card>
        <CardBody className="py-6">
          <CaseFileForm then={then} defaultService={user.serviceName} />
        </CardBody>
      </Card>
    </div>
  );
}

import type { Metadata } from "next";
import { requireUserWith } from "@/lib/auth/guard";
import { canManageOrgSettings } from "@/lib/auth/permissions";
import { getOrgSettings } from "@/lib/services/admin";
import { Card, CardBody, PageHeader } from "@/components/ui/card";
import { SettingsForm } from "./settings-form";

export const metadata: Metadata = { title: "Paramètres de l'établissement" };

export default async function OrgSettingsPage() {
  const user = await requireUserWith(canManageOrgSettings);
  const org = await getOrgSettings(user);
  return (
    <div className="max-w-2xl">
      <PageHeader title="Paramètres de l'établissement" />
      <Card>
        <CardBody className="py-6">
          <SettingsForm org={org} />
        </CardBody>
      </Card>
    </div>
  );
}

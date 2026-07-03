import { listRoles } from "@/lib/storage";
import { PageHeader } from "@/app/_components/PageHeader";
import { NewSessionForm } from "./_components/NewSessionForm";

export default async function NewSessionPage() {
  const roles = listRoles();

  return (
    <div className="bg-white rounded-xl border shadow-sm">
      <PageHeader title="新規面談" />
      <NewSessionForm roles={roles} />
    </div>
  );
}

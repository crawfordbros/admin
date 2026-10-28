import { useAdminPage } from "../components/admin/adminPage";
import { EmptyState, PageHeader } from "../components/display";
import type { IconName } from "../components/icons";

export function ComingSoon({ title, detail, icon }: { title: string; detail: string; icon: IconName }) {
  useAdminPage(title);
  return (
    <>
      <PageHeader title={title} description={detail} />
      <section className="rounded-[14px] border border-line bg-white">
        <EmptyState icon={icon} title="This section is being built" body="It opens here once its part of the API is ready. Nothing here needs your attention yet." />
      </section>
    </>
  );
}

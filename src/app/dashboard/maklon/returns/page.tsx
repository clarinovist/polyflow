import { redirect } from "next/navigation";

export default async function LegacyMaklonReturnsRedirect({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const search =
    typeof params?.search === "string" ? params.search : undefined;
  redirect(
    search
      ? `/maklon/returns?search=${encodeURIComponent(search)}`
      : "/maklon/returns",
  );
}

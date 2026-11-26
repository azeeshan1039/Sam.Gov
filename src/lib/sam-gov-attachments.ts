import type { SamGovOpportunity } from "@/types/sam-gov";

export function samGovAttachments(links?: SamGovOpportunity["resourceLinks"] | null) {
  const attachments = new Map<string, { url: string; name?: string }>();
  for (const link of links ?? []) {
    const url = (typeof link === "string" ? link : link?.link)?.trim();
    if (!url || !/^https?:\/\//i.test(url)) continue;
    const name = typeof link === "string" ? undefined : link.name?.trim();
    if (!attachments.has(url) || (!attachments.get(url)?.name && name)) {
      attachments.set(url, { url, name });
    }
  }
  return Array.from(attachments.values());
}

export function samGovAttachmentUrls(links?: SamGovOpportunity["resourceLinks"] | null): string[] {
  return samGovAttachments(links).map(({ url }) => url);
}

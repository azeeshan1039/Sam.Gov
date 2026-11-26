import { samGovAttachmentUrls } from "@/lib/sam-gov-attachments";

test("converts named SAM.gov files to the URLs accepted by document analysis", () => {
  expect(samGovAttachmentUrls([
    { name: "Statement of work", link: "https://sam.gov/example/sow.pdf" },
    "https://sam.gov/example/amendment.pdf",
    "https://sam.gov/example/sow.pdf",
    { name: "Missing link", link: "" },
  ])).toEqual([
    "https://sam.gov/example/sow.pdf",
    "https://sam.gov/example/amendment.pdf",
  ]);
  expect(samGovAttachmentUrls()).toEqual([]);
});

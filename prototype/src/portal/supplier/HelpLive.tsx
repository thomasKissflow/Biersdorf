// Help in the live portal: the prototype's Help page (how it works, FAQs, the Beiersdorf contact per request), with
// the FAQs taken from the portal's CIQP Help Article form in their Sort_Order (the built-in ones while there are none).
import { SupplierHelp } from "@/features/supplier";
import { useLiveExtras } from "../data/LiveSupplierStore";
import { num, str } from "../data/raw";

export function HelpLive() {
  const extras = useLiveExtras();
  const articles = [...(extras?.articles ?? [])].sort((a, b) => (num(a, "Sort_Order") ?? 999) - (num(b, "Sort_Order") ?? 999));
  const faqs = articles.map((a) => ({ q: str(a, "Article_Title"), a: str(a, "Article_Body") })).filter((f) => f.q);
  return <SupplierHelp faqs={faqs.length ? faqs : undefined} />;
}

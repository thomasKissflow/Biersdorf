// Live portal only (old flow): step 1 "Basic data and configuration" (PS-02/PS-03, REQ-PROC-004), GEN fields +
// SF-01…SF-12, while the CIQP Request is the contact's open task. The prototype asks these questions inside the
// questionnaire instead (MetadataQuestions, D-1). Every change is saved immediately (saveConfig / setAnswer).
import { Send } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, CardHeader, cx } from "@/components/ui";
import { fieldsOf } from "@/domain/catalog";
import type { CiqCase } from "@/domain/types";
import { useStore } from "@/store/store";
import { ConfigQuestionList } from "./ConfigQuestions";
import { FieldRenderer } from "./FieldRenderer";
import { REQUIRED_CONFIG, unansweredConfig } from "./lib";
import { ScopePreview } from "./ScopePreview";

export function MetadataStep({ c }: { c: CiqCase }) {
  const { submitMetadata, saveConfig } = useStore();
  const [attempted, setAttempted] = useState(false);
  const missing = unansweredConfig(c);
  const answered = REQUIRED_CONFIG.length - missing.length;

  const submit = () => {
    setAttempted(true);
    submitMetadata(c.id); // the action toasts the outcome: what is missing, or success once the data is really sent
    if (missing.length === 0) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else document.getElementById(`cfg-${missing[0]}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-6">
        <Card>
          <CardHeader title="Basic data" subtitle="Pre-filled by Beiersdorf from your supplier record. Please check every entry and correct it if needed." />
          <div className="divide-y divide-line">
            {fieldsOf("GEN", c.templateVersion).map((f) => (
              <FieldRenderer key={f.id} c={c} f={f} editable />
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Configuration questions"
            subtitle="Your answers decide which chapters and annexes your questionnaire contains."
            action={
              <Badge tone={missing.length ? "neutral" : "ok"}>
                {answered} of {REQUIRED_CONFIG.length} required answered
              </Badge>
            }
          />
          <ConfigQuestionList c={c} editable attempted={attempted} onAnswer={(_, patch) => saveConfig(c.id, patch)} />
        </Card>
      </div>

      <aside className="lg:sticky lg:top-[calc(var(--app-header-h,108px)_+_16px)] lg:self-start">
        <ScopePreview
          c={c}
          footer={
            <div className="space-y-2">
              <p className={cx("text-[12.5px]", missing.length ? (attempted ? "font-medium text-bad" : "text-ink-2") : "text-ok")}>
                {missing.length ? `${missing.length} required question${missing.length === 1 ? "" : "s"} still open` : "All required questions are answered."}
              </p>
              <Button variant="primary" className="w-full" icon={<Send size={15} />} onClick={submit}>
                Submit basic data
              </Button>
              <p className="text-[11.5px] text-ink-3">Beiersdorf checks the scope and then releases your full questionnaire.</p>
            </div>
          }
        />
      </aside>
    </div>
  );
}

// The e-mail templates of every mail event, with who receives each one and when (REQ-CTL-010, R-1). Static
// templates with placeholders: the mails really sent are in each person's inbox.
import { Lock, Mail } from "lucide-react";
import { useState } from "react";
import { Badge, Card, CardHeader, cx } from "@/components/ui";
import { MAIL_FROM } from "@/domain/mail";
import { Callout } from "./shared";
import { CHANNEL_HINT, CHANNEL_LABEL, GROUP_LABEL, MAIL_TEMPLATES, templateParts, type MailTemplate, type TemplateGroup } from "./mailTemplateData";

const GROUPS: TemplateGroup[] = ["case", "points", "review", "release", "reminders"];

const testId = (t: MailTemplate) => `mail-template-${t.id.replace(":", "-")}`;

function AudienceBadge({ audience }: { audience: MailTemplate["audience"] }) {
  return audience === "supplier" ? <Badge tone="violet">Supplier</Badge> : <Badge tone="brand">Beiersdorf</Badge>;
}

/** Template text with its {placeholders} shown as chips. */
function WithPlaceholders({ text }: { text: string }) {
  return (
    <>
      {templateParts(text).map((p, i) =>
        p.placeholder ? (
          <span key={i} className="mx-px rounded bg-brand-soft px-1 py-px text-[0.92em] font-medium whitespace-nowrap text-brand">
            {p.text}
          </span>
        ) : (
          <span key={i}>{p.text}</span>
        ),
      )}
    </>
  );
}

function Preview({ t }: { t: MailTemplate }) {
  return (
    <Card data-testid="mail-template-preview" data-event={t.event} className="min-w-0 lg:sticky lg:top-[calc(var(--app-header-h,56px)_+_24px)]">
      <CardHeader
        title={
          <span className="inline-flex items-center gap-2">
            <Mail size={15} className="text-ink-3" />
            {t.label}
          </span>
        }
        subtitle={t.when}
        action={<AudienceBadge audience={t.audience} />}
      />
      <div className="p-4">
        <div className="overflow-hidden rounded-lg border border-line">
          <dl className="grid grid-cols-[64px_1fr] gap-x-2 gap-y-1 border-b border-line bg-surface-2 px-4 py-3 text-[12.5px]">
            <dt className="text-ink-3">From</dt>
            <dd className="min-w-0 text-ink-2 [overflow-wrap:anywhere]">{MAIL_FROM}</dd>
            <dt className="text-ink-3">To</dt>
            <dd className="min-w-0 text-ink-2 [overflow-wrap:anywhere]">{t.to}</dd>
            <dt className="text-ink-3">Subject</dt>
            <dd className="min-w-0 font-semibold text-ink [overflow-wrap:anywhere]">
              <WithPlaceholders text={t.subject} />
            </dd>
          </dl>
          <div className="space-y-2 px-4 py-4 text-[13px] leading-relaxed text-ink">
            {t.body.split("\n").map((line, i) => (
              <p key={i}>
                <WithPlaceholders text={line} />
              </p>
            ))}
            <p className="pt-1 font-medium text-brand">{t.audience === "supplier" ? "Open the request in the supplier portal" : "Open it in CIQ Digital"}</p>
          </div>
        </div>
        <p className="mt-3 text-[12.5px] text-ink-3">
          <span className="font-medium text-ink-2">{CHANNEL_LABEL[t.channel]}:</span> {CHANNEL_HINT[t.channel]}. Highlighted words are filled in when the e-mail is sent.
        </p>
      </div>
    </Card>
  );
}

export function MailTemplates() {
  const [selected, setSelected] = useState(MAIL_TEMPLATES[0].id);
  const current = MAIL_TEMPLATES.find((t) => t.id === selected) ?? MAIL_TEMPLATES[0];

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Card className="min-w-0">
          <CardHeader title="E-mails by event" subtitle={`${MAIL_TEMPLATES.length} templates: who is told what, and when. Select one to see its text. The e-mails sent land in each person's inbox.`} />
          <div>
            {GROUPS.map((g) => (
              <div key={g}>
                <div className="border-y border-line bg-surface-2 px-4 py-1.5 text-xs font-semibold tracking-wide text-ink-3 uppercase">{GROUP_LABEL[g]}</div>
                <ul className="divide-y divide-line">
                  {MAIL_TEMPLATES.filter((t) => t.group === g).map((t) => {
                    const on = t.id === current.id;
                    return (
                      <li key={t.id}>
                        <button
                          type="button"
                          data-testid={testId(t)}
                          aria-pressed={on}
                          onClick={() => setSelected(t.id)}
                          className={cx("block w-full px-4 py-2.5 text-left transition-colors", on ? "bg-brand-soft/60" : "hover:bg-surface-2")}
                        >
                          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className={cx("text-[13.5px] font-medium", on ? "text-brand" : "text-ink")}>{t.label}</span>
                            <AudienceBadge audience={t.audience} />
                            {t.channel !== "task-notification" && <Badge tone="neutral">{CHANNEL_LABEL[t.channel]}</Badge>}
                          </span>
                          <span className="mt-0.5 block text-[12.5px] text-ink-2">{t.when}</span>
                          <span className="block text-[12px] text-ink-3">To: {t.to}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </Card>
        <div className="min-w-0">
          <Preview t={current} />
        </div>
      </div>

      <Callout tone="brand" icon={<Lock size={15} />} title="Supplier e-mails never contain internal content">
        They hold only what the supplier sees in the portal anyway: the case, the material, the question with its reference and due date. Internal notes, the RMES, department decisions and internal reasons
        never appear in them.
      </Callout>
    </div>
  );
}

// Help: how the portal works, FAQs (including which e-mails come) and the Beiersdorf contact per request. No video.
// The app always explains the current flow (one questionnaire step); the live portal keeps the old flow's steps and
// passes its own help articles as the FAQs.
// Phones (Thomas, 30 Oct): the header already says "Help", so the page's own title is for screen readers only; each
// question's whole row (not only its text) opens it.
import { ChevronDown, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
  cx,
  useProduction,
} from "@/components/ui";
import { userById } from "@/domain/selectors";
import { useIsLivePortal } from "@/store/portalCaps";
import { useStore } from "@/store/store";
import { caseLink, isClosed, isLiveScope, useSupplierScope } from "./lib";
import { useIsPhone } from "./phone";

/** Live portal (old flow): a separate basic-data step, then the questionnaire Beiersdorf releases. */
const STEPS = [
  {
    title: "Answer the basic questions",
    text: "Check the basic data and answer about ten short questions, above all the origin of the components. Your answers decide which sections your questionnaire contains.",
  },
  {
    title: "Fill in the questionnaire",
    text: "Complete only the sections that apply and upload each document at the question it belongs to. Colleagues can work on other sections at the same time.",
  },
  {
    title: "Confirm completeness",
    text: "When nothing is missing, confirm that the data and documents are complete from your point of view. This is not an approval by Beiersdorf.",
  },
  {
    title: "Answer questions, then give the final release",
    text: "Beiersdorf reviews your submission and may ask questions. When all reviews are complete, you give the final release and the CIQ is frozen.",
  },
];

/** Live-scope requests (D-1): one supplier step for the whole questionnaire, then the review and the final release. */
const STEPS_LIVE = [
  {
    title: "Fill in the questionnaire",
    text: "Check the basic data and answer the metadata questions, above all the origin of the components. The sections that apply open and close as you answer. Fill them in, upload each document at its question, then confirm completeness. This is not an approval by Beiersdorf.",
  },
  {
    title: "Answer Beiersdorf's questions",
    text: "Beiersdorf reviews your questionnaire and may ask you questions directly. You can still correct data and add documents; a changed metadata answer can now only add sections.",
  },
  {
    title: "Give the final release",
    text: "When all reviews are complete, you give the final release. The questionnaire is then frozen and Beiersdorf files the final document.",
  },
];

const SECTIONS_FAQ = {
  q: "Why do I only see some sections?",
  a: "The questionnaire is built from your answers to the basic questions and the target markets set by Beiersdorf. Sections that do not apply to your material are not shown, so you never fill in more than needed. If Beiersdorf needs an additional section later, you get a task for it.",
};

const SECTIONS_FAQ_LIVE = {
  q: "Why do I only see some sections?",
  a: "Your questionnaire follows your answers to the metadata questions and the target markets set by Beiersdorf. Sections open and close as you answer, and answers in a section that closes are kept. After you confirm completeness, a changed answer can only add sections. If Beiersdorf needs more later, you get a task for it.",
};

/** Live portal (old flow): the built-in questions while no help articles are maintained. */
const FAQS = [
  SECTIONS_FAQ,
  {
    q: "Who sees my answers?",
    a: "Your answers and documents are visible to the invited contacts of your company and to the Beiersdorf teams that review the raw material. Other suppliers never see your requests. Beiersdorf's internal notes and assessments are not shown in the portal.",
  },
  {
    q: "What if I cannot provide a document or an answer?",
    a: "Use “Cannot provide? Add a justification” at the question and explain why. A justification counts as answered for the completeness check; Beiersdorf decides whether it is acceptable and may ask a follow-up question.",
  },
  {
    q: "Can several colleagues work on the same request?",
    a: "Yes. Every invited contact of your company can work on the questionnaire at the same time. Each answer and document shows who entered it and when.",
  },
  {
    q: "What about deadlines and reminders?",
    a: "Each request and each question has a due date, shown on your tasks. You receive an e-mail when a new task arrives and a reminder if a task stays open; your Beiersdorf contact is informed if it remains open longer.",
  },
  {
    q: "Can I change an answer after submission?",
    a: "Yes. After you confirm completeness you can still correct data and add documents until Beiersdorf requests your final release; from then on the questionnaire is locked. After the final release nothing can be changed; ask for a correction under Corrections instead.",
  },
];

/** Live-scope requests (the current flow). */
const FAQS_LIVE = [
  SECTIONS_FAQ_LIVE,
  {
    q: "Who sees my answers?",
    a: "Your answers and documents are visible to the contacts Beiersdorf named on the request and to the Beiersdorf teams that review the raw material. Other suppliers, and colleagues who are not named on the request, never see it. Beiersdorf's internal notes and assessments are not shown in the portal.",
  },
  {
    q: "What if I cannot provide a document or an answer?",
    a: "Use “Cannot provide? Add a justification” at the question and explain why. A justification counts as answered for the completeness check; Beiersdorf decides whether it is acceptable and may ask a follow-up question. When Beiersdorf asks you a question, you can also answer “We cannot provide this” with a reason.",
  },
  {
    q: "Where do I upload documents?",
    a: "Always at the question the document belongs to, in the questionnaire. When you answer a Beiersdorf question with a document, it is stored there too, and your reply refers to it. New files are added next to earlier ones with their upload date; nothing is overwritten.",
  },
  {
    q: "Can several colleagues work on the same request?",
    a: "Yes. Every contact Beiersdorf named on the request can work on it at the same time. Each answer and document shows who entered it and when. To add or replace a contact, ask your Beiersdorf contact.",
  },
  {
    q: "Who confirms completeness and gives the final release?",
    a: "Any contact Beiersdorf named on the request who may confirm for your company. Each confirmation is recorded with name, role, e-mail and time. A completeness confirmation is not an approval by Beiersdorf.",
  },
  {
    q: "Which e-mails will I get?",
    a: "Every contact named on a request gets the same e-mails:\n• the invitation when Beiersdorf sends you a request;\n• a new question from Beiersdorf, or one it returns because it needs more information;\n• a question Beiersdorf changed or closed (no answer needed);\n• one request for your final release when Beiersdorf has completed its review, and a note if that request is withdrawn because a review was reopened;\n• a receipt after your final release;\n• reminders before and after a due date;\n• a note when Beiersdorf withdraws or reactivates a request.\nEach e-mail links straight to the item in the portal. Beiersdorf's internal assessments are never sent to you.",
  },
  {
    q: "What about deadlines and reminders?",
    a: "Each request and each question has a due date, shown on your tasks. You get a reminder e-mail before a task is due and when it is overdue; your Beiersdorf contact is informed if it stays open longer.",
  },
  {
    q: "Can I change an answer after confirming completeness?",
    a: "Yes, until Beiersdorf requests your final release: correct data and add documents directly in the questionnaire. Beiersdorf's reviewers are told about each change and look at it again, and a changed metadata answer can then only add sections. Once your final release is requested the questionnaire is locked: if something must change, contact Beiersdorf, who can reopen the review. After the release the questionnaire is frozen; to report a change, use “Report a change” on the released request.",
  },
];

/** `faqs` replaces the built-in questions (the live portal passes the help articles admins maintain in Kissflow). */
export function SupplierHelp({
  faqs,
}: {
  faqs?: { q: string; a: string }[];
}) {
  const { state } = useStore();
  const production = useProduction();
  const phone = useIsPhone();
  const { cases } = useSupplierScope();
  const active = cases.filter((c) => !isClosed(c));
  // The app always explains the current flow, also before the contact has a request (the demo's empty start). The
  // live portal's requests, and the portal's preview of them, do not follow the answers live yet: they keep the old steps.
  const livePortal = useIsLivePortal();
  const live = !production || cases.some(isLiveScope) || (!livePortal && cases.every(isLiveScope));
  const steps = live ? STEPS_LIVE : STEPS;
  const shownFaqs = faqs ?? (live ? FAQS_LIVE : FAQS);
  return (
    <div className="space-y-8">
      <PageHeader
        title={phone ? <span className="sr-only">Help</span> : "Help"}
        subtitle="How the Beiersdorf supplier portal works, answers to common questions and who to contact."
      />

      <section>
        <h2 className="mb-3 text-base font-semibold text-ink">How it works</h2>
        <ol className={cx("grid grid-cols-1 gap-3", steps.length === 3 ? "md:grid-cols-3" : "md:grid-cols-2 xl:grid-cols-4")}>
          {steps.map((s, i) => (
            <li
              key={s.title}
              className="rounded-card border border-line bg-surface px-4 py-4 shadow-card"
            >
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-soft text-[13px] font-semibold text-brand">
                {i + 1}
              </span>
              <p className="mt-3 text-[14px] font-semibold text-ink">
                {s.title}
              </p>
              <p className="mt-1 text-[13px] text-ink-2">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card className="lg:self-start">
          <CardHeader title="Frequently asked questions" />
          <div className="divide-y divide-line">
            {shownFaqs.map((f) => (
              // a phone: the row's padding moves into the summary, so the whole row is its tap target
              <details key={f.q} className={phone ? "group px-5" : "group px-5 py-3.5"}>
                <summary className={cx("flex cursor-pointer list-none items-center justify-between gap-3 text-[14px] font-medium text-ink [&::-webkit-details-marker]:hidden", phone && "py-3.5")}>
                  {f.q}
                  <ChevronDown
                    size={16}
                    className="shrink-0 text-ink-3 transition-transform group-open:rotate-180"
                  />
                </summary>
                <p className={cx(phone ? "-mt-1.5 pb-3.5" : "mt-2", "max-w-3xl text-[13.5px] whitespace-pre-line text-ink-2")}>{f.a}</p>
              </details>
            ))}
          </div>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Your Beiersdorf contacts"
              subtitle="The raw material manager responsible for each open request."
            />
            {active.length === 0 ? (
              <div data-testid="empty-help-contacts">
                <EmptyState title="No open requests">Your Beiersdorf contact appears here once a request is open.</EmptyState>
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {active.map((c) => {
                  const o = userById(state, c.ownerId);
                  return (
                    <li key={c.id} className="px-5 py-3">
                      <Link
                        to={caseLink(c.id)}
                        className="text-[13.5px] font-medium text-ink hover:text-brand"
                      >
                        {c.materialName}
                      </Link>
                      <p className="font-mono text-[11.5px] text-ink-3">
                        {c.id}
                      </p>
                      {o && (
                        <p className="mt-1 text-[13px] text-ink-2">
                          {o.name}, {o.title}
                          <span className="mt-0.5 flex items-center gap-1 text-[12.5px] text-ink-3 select-all">
                            <Mail size={12} /> {o.email}
                          </span>
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

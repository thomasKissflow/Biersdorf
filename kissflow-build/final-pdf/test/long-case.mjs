// A fictional long final document for the PDF layout tests and samples, built from the fixture case's document
// (fixtures/kissflow.json expected ZZT-0005): case ZZT-0099 with many open points over several rounds, long answers
// (one taller than a page), a long composition and evidence list, file names without spaces, umlauts and accents, a
// justified not-applicable section and a section added later. All people, companies and addresses are fictional.
// Pure and deterministic. The result has no valid seal: callers re-seal it with the app's fingerprintOf when they need one.

const SENTENCES = [
  "The raw material is produced in a closed batch process under GMP conditions.",
  "Each batch is filtered, deodorised and tested against the specification before release.",
  "Stabilisation uses natural tocopherols only; no synthetic antioxidant is added.",
  "Die Ölphase wird bei höchstens 60 °C gemischt, danach unter Stickstoff abgefüllt.",
  "Les lots sont libérés après contrôle qualité; la traçabilité est assurée jusqu'à la matière première.",
  "Residual solvents are below the limits of ICH Q3C; heavy metals are below 1 mg/kg in total.",
  "Storage: 15–25 °C, protected from light, in the closed original drum (≤ 24 months).",
];
const text = (n, from = 0) => Array.from({ length: n }, (_, i) => SENTENCES[(from + i) % SENTENCES.length]).join(" ");
const at = (day, h, m = 0) => `2026-10-${String(day).padStart(2, "0")}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00.000Z`;

const INCI = [
  ["Caprylic/Capric Triglyceride", "73398-61-5", "277-452-2", "emollient", "vegetable"],
  ["Helianthus Annuus (Sunflower) Seed Oil", "8001-21-6", "232-273-9", "skin conditioning", "vegetable"],
  ["Tocopherol", "59-02-9", "200-412-2", "antioxidant", "vegetable"],
  ["Butyrospermum Parkii (Shea) Butter", "194043-92-0", null, "emollient", "vegetable"],
  ["Simmondsia Chinensis (Jojoba) Seed Oil", "61789-91-1", "612-171-5", "emollient", "vegetable"],
  ["Squalane", "111-01-3", "203-825-6", "emollient", "vegetable"],
  ["Hydrogenated Vegetable Oil (and) Rosmarinus Officinalis (Rosemary) Leaf Extract (and) Ascorbyl Palmitate", null, null, "antioxidant blend", "vegetable"],
  ["Glyceryl Stearate", "31566-31-1", "250-705-4", "emulsifying", "vegetable"],
  ["Lecithin", "8002-43-5", "232-307-2", "emulsifying", "vegetable"],
  ["Olea Europaea (Olive) Fruit Oil", "8001-25-0", "232-277-0", "emollient", "vegetable"],
];

export function longCase(base) {
  const d = JSON.parse(JSON.stringify(base));
  delete d.fingerprint;
  d.id = "ZZT-0099-FD";
  d.caseId = "ZZT-0099";
  d.trigger = "Final release by Jürgen Weiß";
  d.header = {
    ...d.header,
    caseId: "ZZT-0099",
    materialName: "LIPOFLUID ÖLPHASE 7 – Pflegeöl für Gesichtscremes (Qualität „Süd“)",
    inci: "Caprylic/Capric Triglyceride (and) Helianthus Annuus (Sunflower) Seed Oil (and) Tocopherol",
    supplierName: "Brückner & Söhne Oléochimie GmbH",
    duns: "390117245",
    manufacturer: "Brückner & Söhne Oléochimie GmbH, Hafenstraße 12, 20457 Hamburg, Deutschland",
    site: "Werk Süd, Industriestraße 4, 68159 Mannheim; Lohnabfüllung: Société Lefèvre & Fils, Lyon",
    markets: ["EU", "UK", "TR", "CN", "US"],
  };
  // long answers: a multi-paragraph value, a long justification, and one answer taller than a page
  d.sections = d.sections.map((s) => {
    if (s.sectionId === "GEN")
      return {
        ...s,
        answers: s.answers.map((a, i) =>
          i === 5 ? { ...a, value: `Brückner & Söhne Oléochimie GmbH\nHafenstraße 12\n20457 Hamburg, Deutschland\n\n${text(3)}`, by: "Jürgen Weiß" } : i === 6 ? { ...a, value: text(4, 2), justification: text(2, 4) } : a,
        ),
      };
    if (s.sectionId === "K2.2")
      return {
        ...s,
        answers: [
          ...s.answers,
          { fieldId: "FLD-ZZT-LONG", label: "Description of the manufacturing process, step by step (all steps, with temperatures and controls)", value: Array.from({ length: 9 }, (_, i) => `Step ${i + 1}: ${text(6, i)}`).join("\n\n"), by: "Søren Ødegård", at: at(19, 9, 15) },
        ],
      };
    if (s.sectionId === "K6.8") return { ...s, applicability: "na", justification: `Not applicable for this grade. ${text(2, 1)}` };
    if (s.sectionId === "K6.16") return { ...s, addedLater: true };
    return s;
  });
  d.components = Array.from({ length: 26 }, (_, i) => {
    const [inci, cas, ec, fn, origin] = INCI[i % INCI.length];
    return { id: `c${i + 1}`, inci: i < INCI.length ? inci : `${inci} (Charge ${String.fromCharCode(65 + (i % 26))})`, cas, ec, fn, additive: i % 4 === 2, origin, concMin: (i % 5) * 2, concMax: (i % 5) * 2 + 3 };
  });
  const people = ["Elena Márquez", "Ravi Menon", "Jürgen Weiß", "Zoë Švec", "François Lefèvre"];
  d.evidence = [
    ...d.evidence,
    ...Array.from({ length: 18 }, (_, i) => ({
      documentId: `ZZT-0099-d${i + 1}`,
      name: i % 3 === 0 ? `ZZT-0099_K6.12_GMP-Zertifikat_ISO-22716_Werk-Süd_${2026 + i}-${2029 + i}_unterschrieben_und_beglaubigt.pdf` : `Analysenzertifikat Charge ${2400 + i} (Prüfbericht Nr. ${7000 + i * 13}).pdf`,
      sectionId: i % 2 ? "K2.2" : "K1",
      sectionCode: i % 2 ? "K2.2" : "K1",
      fieldLabel: i % 2 ? "Analytical evidence from at least two batches" : "Certificate of analysis (CoA)",
      uploadedBy: people[i % people.length],
      uploadedAt: at(19, 6 + (i % 12), i * 3),
    })),
    { documentId: "ZZT-0099-slot-1", name: "Allergen statement", sectionId: "K1", sectionCode: "K1", fieldLabel: "Requested document: Allergen statement", uploadedBy: "Zoë Švec", uploadedAt: at(19, 18), requested: "Allergen statement", justification: `No allergen of Annex III is used on the line. ${text(2, 5)}` },
  ];
  const kinds = ["query", "document-request", "query", "additional-part", "query"];
  const results = ["Accepted", "Accepted", "Not accepted", "Closed, no answer needed", "Accepted"];
  d.threads = [
    ...d.threads,
    ...Array.from({ length: 8 }, (_, k) => {
      const raiser = ["Katrin Vogel", "Dr. Mira Hansen", "Dr. Jonas Albrecht", "Lena Krause"][k % 4];
      const rounds = Array.from({ length: 1 + (k % 4) }, (_, r) => ({
        n: r + 1,
        entries: [
          { at: at(20, 6 + r, k * 5), by: raiser, side: "internal", action: r ? "returned" : "raised", text: r ? `Please complete the answer. ${text(1 + (k % 3), r + k)}` : `Question ${k + 1}: ${text(2 + (k % 3), k)}` },
          { at: at(20, 6 + r, k * 5 + 30), by: people[(k + r) % people.length], side: "supplier", action: (k + r) % 5 === 4 ? "cannot-provide" : "answered", text: `${text(2 + ((k + r) % 4), k + r)}\n\nRegards,\n${people[(k + r) % people.length]}`, ...(r % 2 === 0 ? { attachment: `ZZT-0099_Antwort_OP-${k + 3}_Runde-${r + 1}_Prüfbericht.pdf` } : {}) },
        ],
      }));
      rounds[rounds.length - 1].entries.push({ at: at(20, 12, k * 5), by: raiser, side: "internal", action: results[k % 5] === "Accepted" ? "accepted" : "note", text: results[k % 5] === "Accepted" ? "Accepted." : "Closed as not accepted." });
      return { opId: `OP-0099-${String(k + 3).padStart(2, "0")}`, ref: ["K2.2 › Arsenic (As) content", "K6.12 › GMP certificate", "Annex 2 › Manufacturing process", "K1 › specification", "K4.1 › toxicity data"][k % 5], kind: kinds[k % 5], raisedBy: raiser, raisedAt: at(20, 6, k * 5), result: results[k % 5], rounds };
    }),
  ];
  return d;
}

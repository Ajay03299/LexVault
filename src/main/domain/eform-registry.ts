/**
 * eform-registry.ts
 * ---------------------------------------------------------------------------
 * The domain brain of LexVault. Encodes real MCA21 eForm semantics so the rest
 * of the system (folder routing, classification, intelligence extractors) works
 * off structured knowledge instead of brittle filename string-matching.
 *
 * The reference tool ("MCA Document Downloader v1.0") only prefixes filenames
 * with a coarse MCA category code ([CRT]/[INC]/[OEFD]...). We go further: every
 * form maps to a canonical doc class, a destination folder, and the intelligence
 * extractor that should run on it (director / charge / capital / etc.).
 * ---------------------------------------------------------------------------
 */

export type Folder =
  | 'Incorporation'
  | 'Annual_Returns'
  | 'Financial_Statements'
  | 'Charges'
  | 'Director_Changes'
  | 'Share_Capital'
  | 'Other_Filings';

export type ExtractorKind =
  | 'incorporation'
  | 'directors'
  | 'charges'
  | 'capital'
  | 'financials'
  | 'annual_return'
  | 'auditor'
  | 'none';

export interface EFormSpec {
  /** Canonical form id as MCA names it (normalised, no spaces). */
  form: string;
  /** Human label. */
  label: string;
  /** Canonical class id used in documents.doc_class. */
  docClass: string;
  /** Destination folder in the company tree. */
  folder: Folder;
  /** Which intelligence extractor consumes this form. */
  extractor: ExtractorKind;
  /** MCA "View Public Documents" category codes this form usually appears under. */
  mcaCategories: string[];
  /** Lowercase keyword signals that appear in titles for fuzzy matching. */
  signals: string[];
}

/**
 * Authoritative registry. Extend freely — this is meant to grow.
 * Source: MCA21 eForm catalogue (Companies Act 2013 + LLP Act).
 */
export const EFORM_REGISTRY: EFormSpec[] = [
  // ---- Incorporation -------------------------------------------------------
  { form: 'SPICe+',  label: 'Incorporation Application (SPICe+ / INC-32)', docClass: 'incorporation.spice', folder: 'Incorporation', extractor: 'incorporation', mcaCategories: ['INC','CRT'], signals: ['spice', 'inc-32', 'inc32', 'incorporation'] },
  { form: 'INC-33',  label: 'eMemorandum of Association', docClass: 'incorporation.moa', folder: 'Incorporation', extractor: 'none', mcaCategories: ['INC'], signals: ['emoa', 'memorandum', 'inc-33', 'inc33'] },
  { form: 'INC-34',  label: 'eArticles of Association', docClass: 'incorporation.aoa', folder: 'Incorporation', extractor: 'none', mcaCategories: ['INC'], signals: ['eaoa', 'articles', 'inc-34', 'inc34'] },
  { form: 'INC-22',  label: 'Registered Office Address', docClass: 'incorporation.registered_office', folder: 'Incorporation', extractor: 'none', mcaCategories: ['OEFD','INC'], signals: ['inc-22', 'inc22', 'registered office'] },
  { form: 'INC-20A', label: 'Declaration for Commencement of Business', docClass: 'incorporation.commencement', folder: 'Incorporation', extractor: 'none', mcaCategories: ['OEFD','INC'], signals: ['inc-20a', 'inc20a', 'commencement'] },
  { form: 'COI',     label: 'Certificate of Incorporation', docClass: 'incorporation.coi', folder: 'Incorporation', extractor: 'incorporation', mcaCategories: ['CRT'], signals: ['certificate of incorporation', 'part b certificate'] },

  // ---- Directors -----------------------------------------------------------
  { form: 'DIR-12',  label: 'Particulars of Directors / Changes', docClass: 'directors.change', folder: 'Director_Changes', extractor: 'directors', mcaCategories: ['CD'], signals: ['dir-12', 'dir12', 'directors'] },
  { form: 'DIR-3',   label: 'DIN Application', docClass: 'directors.din', folder: 'Director_Changes', extractor: 'directors', mcaCategories: ['CD','OEFD'], signals: ['dir-3', 'dir3', 'din application'] },
  { form: 'DIR-3KYC',label: 'Director KYC', docClass: 'directors.kyc', folder: 'Director_Changes', extractor: 'none', mcaCategories: ['CD','OEFD'], signals: ['dir-3 kyc', 'dir3kyc', 'director kyc'] },

  // ---- Charges -------------------------------------------------------------
  { form: 'CHG-1',   label: 'Creation / Modification of Charge', docClass: 'charges.creation', folder: 'Charges', extractor: 'charges', mcaCategories: ['CHR'], signals: ['chg-1', 'chg1', 'charge'] },
  { form: 'CHG-4',   label: 'Satisfaction of Charge', docClass: 'charges.satisfaction', folder: 'Charges', extractor: 'charges', mcaCategories: ['CHR'], signals: ['chg-4', 'chg4', 'satisfaction'] },
  { form: 'CHG-9',   label: 'Charge for Debentures', docClass: 'charges.debentures', folder: 'Charges', extractor: 'charges', mcaCategories: ['CHR'], signals: ['chg-9', 'chg9', 'debenture'] },

  // ---- Share capital -------------------------------------------------------
  { form: 'SH-7',    label: 'Increase in Authorized Share Capital', docClass: 'capital.increase_authorized', folder: 'Share_Capital', extractor: 'capital', mcaCategories: ['OEFD'], signals: ['sh-7', 'sh7', 'authorized capital'] },
  { form: 'PAS-3',   label: 'Return of Allotment', docClass: 'capital.allotment', folder: 'Share_Capital', extractor: 'capital', mcaCategories: ['OEFD'], signals: ['pas-3', 'pas3', 'allotment'] },

  // ---- Financials ----------------------------------------------------------
  { form: 'AOC-4',   label: 'Filing of Financial Statements', docClass: 'financials.aoc4', folder: 'Financial_Statements', extractor: 'financials', mcaCategories: ['ARB','ANR'], signals: ['aoc-4', 'aoc4', 'financial statement', 'balance sheet'] },
  { form: 'AOC-4XBRL', label: 'Financial Statements (XBRL)', docClass: 'financials.aoc4_xbrl', folder: 'Financial_Statements', extractor: 'financials', mcaCategories: ['ARB','ANR'], signals: ['xbrl'] },
  { form: 'AOC-5',   label: 'Address for Books of Account', docClass: 'financials.aoc5', folder: 'Financial_Statements', extractor: 'none', mcaCategories: ['OEFD'], signals: ['aoc-5', 'aoc5', 'books of account'] },

  // ---- Annual returns ------------------------------------------------------
  { form: 'MGT-7',   label: 'Annual Return', docClass: 'annual_returns.mgt7', folder: 'Annual_Returns', extractor: 'annual_return', mcaCategories: ['ARB','ANR'], signals: ['mgt-7', 'mgt7'] },
  { form: 'MGT-7A',  label: 'Annual Return (Small Co / OPC)', docClass: 'annual_returns.mgt7a', folder: 'Annual_Returns', extractor: 'annual_return', mcaCategories: ['ARB','ANR'], signals: ['mgt-7a', 'mgt7a'] },
  { form: 'MGT-14',  label: 'Filing of Resolutions', docClass: 'annual_returns.mgt14', folder: 'Annual_Returns', extractor: 'none', mcaCategories: ['OEFD'], signals: ['mgt-14', 'mgt14', 'resolution'] },

  // ---- Auditor / other -----------------------------------------------------
  { form: 'ADT-1',   label: 'Auditor Appointment', docClass: 'other.adt1', folder: 'Other_Filings', extractor: 'auditor', mcaCategories: ['OEFD'], signals: ['adt-1', 'adt1', 'auditor appoint'] },
  { form: 'ADT-3',   label: 'Auditor Resignation', docClass: 'other.adt3', folder: 'Other_Filings', extractor: 'auditor', mcaCategories: ['OEFD'], signals: ['adt-3', 'adt3', 'auditor resign'] },
  { form: 'DPT-3',   label: 'Return of Deposits', docClass: 'other.dpt3', folder: 'Other_Filings', extractor: 'none', mcaCategories: ['OEFD'], signals: ['dpt-3', 'dpt3', 'deposit'] },
  { form: 'BEN-2',   label: 'Significant Beneficial Ownership', docClass: 'other.ben2', folder: 'Other_Filings', extractor: 'none', mcaCategories: ['OEFD'], signals: ['ben-2', 'ben2', 'beneficial owner'] },
];

const NORMALISED = (s: string) => s.toLowerCase().replace(/[\s_]+/g, ' ').trim();

/** Fast lookup by canonical form id. */
const BY_FORM = new Map<string, EFormSpec>(
  EFORM_REGISTRY.map((e) => [NORMALISED(e.form), e]),
);

export interface ClassificationResult {
  docClass: string;
  folder: Folder;
  formSpec: EFormSpec | null;
  extractor: ExtractorKind;
  confidence: number;          // 0..1
  by: 'rule' | 'unknown';
}

/**
 * Rule-based classifier. Returns a confident class when form/title clearly maps;
 * otherwise low confidence so the pipeline can escalate to the LLM classifier.
 *
 * @param formType raw form type from MCA listing (may be null)
 * @param title    raw document title from MCA listing
 * @param mcaCategory coarse MCA category code (CRT/INC/OEFD/...)
 */
export function classify(
  formType: string | null,
  title: string | null,
  mcaCategory?: string | null,
): ClassificationResult {
  const ft = formType ? NORMALISED(formType) : '';
  const tt = title ? NORMALISED(title) : '';

  // 1) exact form id match → highest confidence
  if (ft && BY_FORM.has(ft)) {
    const spec = BY_FORM.get(ft)!;
    return { docClass: spec.docClass, folder: spec.folder, formSpec: spec, extractor: spec.extractor, confidence: 0.99, by: 'rule' };
  }

  // 2) form id appears as a token inside the raw form/title (e.g. "INC-34_INC34 eAOA")
  for (const spec of EFORM_REGISTRY) {
    const f = NORMALISED(spec.form);
    if ((ft && ft.includes(f)) || (tt && tt.includes(f))) {
      return { docClass: spec.docClass, folder: spec.folder, formSpec: spec, extractor: spec.extractor, confidence: 0.9, by: 'rule' };
    }
  }

  // 3) signal keyword match in title
  let best: { spec: EFormSpec; score: number } | null = null;
  for (const spec of EFORM_REGISTRY) {
    for (const sig of spec.signals) {
      if (tt.includes(sig)) {
        const score = sig.length;             // longer signal == more specific
        if (!best || score > best.score) best = { spec, score };
      }
    }
  }
  if (best) {
    return { docClass: best.spec.docClass, folder: best.spec.folder, formSpec: best.spec, extractor: best.spec.extractor, confidence: 0.75, by: 'rule' };
  }

  // 4) fall back to MCA coarse category → folder, low confidence (LLM should refine)
  const categoryFolder: Record<string, Folder> = {
    CRT: 'Incorporation', INC: 'Incorporation', CD: 'Director_Changes',
    CHR: 'Charges', ARB: 'Annual_Returns', ANR: 'Annual_Returns', OEFD: 'Other_Filings', ORS: 'Other_Filings',
  };
  const folder = (mcaCategory && categoryFolder[mcaCategory]) || 'Other_Filings';
  return { docClass: 'unknown', folder, formSpec: null, extractor: 'none', confidence: 0.2, by: 'unknown' };
}

/** All destination folders (used to scaffold the company directory tree). */
export const ALL_FOLDERS: Folder[] = [
  'Incorporation', 'Annual_Returns', 'Financial_Statements',
  'Charges', 'Director_Changes', 'Share_Capital', 'Other_Filings',
];

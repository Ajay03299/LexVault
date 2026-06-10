/**
 * extractors.ts — pull structured corporate events out of extracted document text.
 *
 * These are deterministic, testable, rule-based extractors keyed off the eForm
 * type (see eform-registry's `extractor` field). They produce the director /
 * charge / capital events that populate the corporate timeline and the diligence
 * report. The LLM (Sprint 3 AI) refines low-confidence cases and writes summaries,
 * but the baseline never depends on a model being available.
 *
 * Patterns target the labelled field text that MCA eForm PDFs produce when their
 * text layer is extracted (e.g. "DIN: 09876543", "Amount secured ... Rs. 5,00,00,000").
 * They are intentionally tolerant; refine against real documents as samples arrive.
 */

const DATE_RE = /\b(\d{2})[/-](\d{2})[/-](\d{4})\b/g

export function parseDate(s: string): string | null {
  DATE_RE.lastIndex = 0
  const m = DATE_RE.exec(s)
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

/** Rs. 5,00,00,000 / "50000000" / "Rs 1,00,000" → number */
export function parseAmount(s: string): number | null {
  const m = s.match(/(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d+)?)/i) || s.match(/\b(\d{1,3}(?:,\d{2,3})+(?:\.\d+)?)\b/)
  if (!m) return null
  const n = Number(m[1].replace(/,/g, ''))
  return Number.isFinite(n) ? n : null
}

export interface DirectorExtract {
  din: string | null
  name: string
  eventType: 'appointment' | 'resignation' | 'cessation' | 'change_designation'
  designation: string | null
  effectiveDate: string | null
}

export function extractDirectors(text: string): DirectorExtract[] {
  const out: DirectorExtract[] = []
  const lower = text.toLowerCase()
  const isCessation = /(cessation|resignation|ceasing|resign|vacat)/.test(lower)
  const isAppointment = /(appointment|appoint|joined|added)/.test(lower)
  const designation =
    /(managing director|whole[- ]?time director|independent director|additional director|nominee director|director)/i.exec(text)?.[1] ?? null

  // each DIN with the nearest preceding/following uppercase name
  const dinRe = /\b(?:din[:\s/-]*|director identification number[:\s]*)?(\d{8})\b/gi
  const seen = new Set<string>()
  let m: RegExpExecArray | null
  while ((m = dinRe.exec(text))) {
    const din = m[1]
    if (seen.has(din)) continue
    seen.add(din)
    const around = text.slice(Math.max(0, m.index - 80), m.index + 80)
    const name =
      /\b([A-Z][A-Z]+(?:\s+[A-Z][A-Z]+){1,3})\b/.exec(around)?.[1] ??
      /name[:\s]+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3})/i.exec(around)?.[1] ??
      'Unknown'
    out.push({
      din,
      name: name.trim(),
      eventType: isCessation && !isAppointment ? 'cessation' : 'appointment',
      designation,
      effectiveDate: parseDate(around) ?? parseDate(text)
    })
  }
  return out
}

export interface ChargeExtract {
  holderName: string | null
  amount: number | null
  status: 'created' | 'modified' | 'satisfied'
  createdOn: string | null
  satisfiedOn: string | null
}

export function extractCharges(text: string, formType?: string | null): ChargeExtract {
  const lower = text.toLowerCase()
  const status: ChargeExtract['status'] =
    /chg-?4|satisf/i.test(`${formType ?? ''} ${lower}`) ? 'satisfied'
      : /modif/i.test(lower) ? 'modified'
        : 'created'
  const holderName =
    /(?:in favour of|charge holder[:\s]*|name of (?:the )?charge holder[:\s]*)\s*([A-Z][A-Za-z0-9 .&'-]{3,60}?(?:bank|limited|ltd|finance|financial|corporation|fund|trust|llp))/i.exec(text)?.[1]?.trim() ?? null
  const amount =
    parseAmount(/(?:amount secured|amount of (?:the )?charge|secured by (?:this|the) charge)[^\d]{0,30}([\d,]+)/i.exec(text)?.[0] ?? '') ??
    parseAmount(text)
  const date = parseDate(text)
  return {
    holderName,
    amount,
    status,
    createdOn: status === 'satisfied' ? null : date,
    satisfiedOn: status === 'satisfied' ? date : null
  }
}

export interface CapitalExtract {
  eventType: 'increase_authorized' | 'allotment' | 'reduction' | 'buyback' | 'transfer'
  authorizedCapital: number | null
  paidUpCapital: number | null
  instrument: string | null
  effectiveDate: string | null
}

export function extractCapital(text: string, formType?: string | null): CapitalExtract {
  const lower = `${formType ?? ''} ${text}`.toLowerCase()
  const eventType: CapitalExtract['eventType'] =
    /pas-?3|allot/.test(lower) ? 'allotment'
      : /sh-?7|authori[sz]ed/.test(lower) ? 'increase_authorized'
        : /reduc/.test(lower) ? 'reduction'
          : /buy[- ]?back/.test(lower) ? 'buyback'
            : 'allotment'
  const instrument =
    /(equity|preference|debenture)/i.exec(text)?.[1]?.toLowerCase() ?? null
  // for SH-7 "altered/revised authorised capital" tends to be the larger figure
  const authorizedCapital =
    parseAmount(/(?:revised|altered|increased to|new)\s+authori[sz]ed\s+capital[^\d]{0,20}([\d,]+)/i.exec(text)?.[0] ?? '') ?? null
  const paidUpCapital =
    parseAmount(/paid[- ]?up\s+capital[^\d]{0,20}([\d,]+)/i.exec(text)?.[0] ?? '') ?? null
  return {
    eventType,
    authorizedCapital,
    paidUpCapital,
    instrument,
    effectiveDate: parseDate(text)
  }
}

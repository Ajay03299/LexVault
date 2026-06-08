/**
 * session.ts — the collection state machine the UI drives.
 * idle → opening → awaiting_user (human logs in + pays) → working → complete/error
 */
import { activity } from '../logger'
import { open, capture, close, isOpen } from './browser'
import { enumerate, downloadAndProcess } from './collector'
import { getCompany } from '../../db/companies.repo'

export type SessionStatus =
  | 'idle'
  | 'opening'
  | 'awaiting_user'
  | 'working'
  | 'complete'
  | 'error'

interface SessionState {
  status: SessionStatus
  companyId: number | null
  cin: string | null
  message: string
}

const state: SessionState = { status: 'idle', companyId: null, cin: null, message: '' }

export function getStatus(): SessionState {
  return { ...state }
}

export async function start(companyId: number): Promise<SessionState> {
  const company = getCompany(companyId)
  if (!company) throw new Error('Company not found')
  state.companyId = companyId
  state.cin = company.cin
  state.status = 'opening'
  state.message = 'Opening MCA portal…'
  try {
    await open()
    state.status = 'awaiting_user'
    state.message =
      'Log in, open this company in “View Public Documents V3”, complete payment, then click Resume.'
  } catch (err) {
    state.status = 'error'
    state.message = (err as Error).message
    activity.error(`Failed to open portal: ${state.message}`, { companyId })
  }
  return getStatus()
}

export async function resume(): Promise<SessionState> {
  if (!isOpen() || !state.companyId || !state.cin) {
    throw new Error('No open session. Start a collection first.')
  }
  state.status = 'working'
  state.message = 'Enumerating and downloading documents…'
  try {
    await enumerate(state.companyId, state.cin)
    const res = await downloadAndProcess(state.companyId, state.cin, 5)
    state.status = 'complete'
    state.message = `Done — downloaded ${res.downloaded}, failed ${res.failed}.`
  } catch (err) {
    state.status = 'error'
    state.message = (err as Error).message
    activity.error(`Collection failed: ${state.message}`, { companyId: state.companyId })
  }
  return getStatus()
}

export async function captureNow(): Promise<{ html: string; screenshot: string }> {
  if (!state.cin) throw new Error('No active company.')
  return capture(state.cin)
}

export async function stop(): Promise<SessionState> {
  await close()
  state.status = 'idle'
  state.message = ''
  state.companyId = null
  state.cin = null
  return getStatus()
}

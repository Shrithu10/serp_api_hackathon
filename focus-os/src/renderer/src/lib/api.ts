import type { Api } from '@shared/api'
import { createMockApi } from './mockApi'

declare global { interface Window { api?: Api } }

/** In Electron this is the preload bridge; in a plain browser (npm run dev:web) it is an in-memory demo. */
export const isElectron = typeof window !== 'undefined' && !!window.api
export const api: Api = window.api ?? createMockApi()

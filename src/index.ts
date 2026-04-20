export { Alby, AlbyClient } from './client'
export { parseDsn, DsnError } from './dsn'
export { FetchTransport } from './transport'
export { exceptionFromError, parseStack } from './stack'
export type {
  AlbyOptions,
  EventPayload,
  ExceptionPayload,
  StackFrame,
  Breadcrumb,
  UserContext,
  Level,
  Transport,
  IngestResponse,
} from './types'

// Default export for the IIFE build: `window.Alby` ergonomics.
import { Alby } from './client'
export default Alby

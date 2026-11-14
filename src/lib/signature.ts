import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const SIGNATURE_HEADER_PATTERN = /^t=(\d+),sha256=([a-f0-9]{64})$/
const SIGNATURE_MAX_AGE_SECONDS = 5 * 60

export const SIGNATURE_HEADER = 'x-formstep-signature'

export function createWebhookSecret(): string {
  return `whsec_${randomBytes(32).toString('hex')}`
}

/** A request header, whatever case the sender or the platform gave its name. */
export function headerValue(headers: Record<string, string> | undefined, name: string): string | undefined {
  if (!headers) return undefined
  const wanted = name.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return value
  }
  return undefined
}

/**
 * Whether `X-Formstep-Signature` is the HMAC-SHA256 of `{t}.{raw body}` under
 * the subscription's secret, signed within the last five minutes.
 *
 * Activepieces hands a trigger the raw body as a UTF-8 string, so it is
 * encoded back to the bytes Formstep signed; a JSON body is UTF-8, so the
 * round trip is exact.
 */
export function verifyWebhookSignature(params: {
  secret: string
  signatureHeader: string | undefined
  rawBody: string
  nowSeconds?: number
}): boolean {
  const { secret, signatureHeader, rawBody } = params
  if (secret.length === 0 || typeof signatureHeader !== 'string') return false

  const match = SIGNATURE_HEADER_PATTERN.exec(signatureHeader)
  if (!match) return false
  const [, timestamp, signatureHex] = match
  const timestampSeconds = Number(timestamp)
  if (!Number.isSafeInteger(timestampSeconds)) return false

  const nowSeconds = params.nowSeconds ?? Math.floor(Date.now() / 1000)
  if (Math.abs(nowSeconds - timestampSeconds) > SIGNATURE_MAX_AGE_SECONDS) return false

  const expected = createHmac('sha256', secret).update(`${timestamp}.`).update(Buffer.from(rawBody, 'utf8')).digest()
  const received = Buffer.from(signatureHex, 'hex')
  return expected.length === received.length && timingSafeEqual(expected, received)
}

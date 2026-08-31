import crypto from 'crypto'
import { User } from '../../types/Studio'

const localTokenSecret = crypto.randomBytes(32).toString('hex')

const tokenSecret = () => {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET
  if (process.env.NODE_ENV === 'production') throw new Error('Production requires JWT_SECRET.')
  return localTokenSecret
}

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const derived = crypto.scryptSync(password, salt, 64).toString('hex')
  return `scrypt$${salt}$${derived}`
}

export function verifyPassword(password: string, encoded: string): boolean {
  const [algorithm, salt, expected] = encoded.split('$')
  if (algorithm !== 'scrypt' || !salt || !expected) return false
  const actual = crypto.scryptSync(password, salt, 64).toString('hex')
  if (actual.length !== expected.length) return false
  return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
}

function encode(value: string): string {
  return Buffer.from(value).toString('base64url')
}

function decode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8')
}

export function createSessionToken(user: User): string {
  const payload = encode(JSON.stringify({ sub: user.id, studioId: user.studioId, exp: Date.now() + 1000 * 60 * 60 * 24 * 14 }))
  const signature = crypto.createHmac('sha256', tokenSecret()).update(payload).digest('base64url')
  return `${payload}.${signature}`
}

export function verifySessionToken(token: string): { userId: string; studioId: string } | null {
  const [payload, signature] = token.split('.')
  if (!payload || !signature) return null
  const expected = crypto.createHmac('sha256', tokenSecret()).update(payload).digest('base64url')
  if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null
  try {
    const data = JSON.parse(decode(payload)) as { sub?: string; studioId?: string; exp?: number }
    if (!data.sub || !data.studioId || !data.exp || data.exp < Date.now()) return null
    return { userId: data.sub, studioId: data.studioId }
  } catch {
    return null
  }
}

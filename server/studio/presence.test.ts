import assert from 'assert'
import { markOnline, markOffline, resetPresence } from './presence'

resetPresence()
const base = { userId: 'presence-user', displayName: 'Presence User', role: 'MEMBER' as const, x: 10, y: 20, currentRoom: 'LOBBY' }
markOnline({ ...base, sessionId: 'presence-tab-a' })
markOnline({ ...base, sessionId: 'presence-tab-b', currentRoom: 'DESIGN' })
assert.equal(markOffline(base.userId, 'presence-tab-a')?.online, true)
assert.equal(markOffline(base.userId, 'presence-tab-a')?.online, true)
const offline = markOffline(base.userId, 'presence-tab-b')
assert.equal(offline?.online, false)
assert.equal(offline?.sessionId, 'presence-tab-b')
resetPresence()

console.log('Presence tests passed: multi-tab disconnect keeps a user online until the last session closes')

import assert from 'node:assert/strict'

import { getRoomForPosition, STUDIO_DESTINATION_EXIT, studioInteractiveObjects, studioRoomZones, studioWorldPortals } from '../../types/StudioWorld'

const expectedRooms = [
  ['DESIGN', 'Game Design Lab', 'WORK'],
  ['ART', 'Creative Studio', 'WORK'],
  ['DEVELOPMENT', 'Engineering Hub', 'WORK'],
  ['LOBBY', 'Studio Commons', 'WORK'],
  ['QA', 'Quality Lab', 'WORK'],
  ['MEETING', 'People Ops', 'WORK'],
  ['GAME_LOUNGE', 'Play Lounge', 'PLAY'],
  ['ARCADE', 'Arcade Hall', 'PLAY'],
  ['CARD_ROOM', 'VIP Games', 'PLAY'],
] as const

assert.deepEqual(
  studioRoomZones.map((zone) => [zone.id, zone.name, zone.group]),
  expectedRooms,
)
assert.equal(new Set(studioRoomZones.map((zone) => zone.id)).size, studioRoomZones.length)

for (const zone of studioRoomZones) {
  assert.ok(zone.accessPoints.length > 0, `${zone.id} needs at least one access point`)
}

const workStations = studioInteractiveObjects.filter((object) => object.type === 'WORK_STATION')
const careerStationIds = ['GAME_DESIGN_STATION', 'ART_STATION', 'ANIMATION_STATION', 'FRONTEND_STATION', 'BACKEND_STATION', 'QA_STATION', 'QC_STATION', 'PM_STATION', 'HR_STATION']
assert.equal(workStations.length, careerStationIds.length, 'Each career needs one physical workstation')
assert.deepEqual(workStations.map((station) => station.stationId), careerStationIds)
assert.equal(studioInteractiveObjects.find((object) => object.id === 'build-machine')?.accessVisibility, 'PRIMARY', 'Build Machine must be visible as a physical access point')

assert.equal(studioWorldPortals.length, 2, 'The office exit must expose Fishing and My Home')
for (const portal of studioWorldPortals) {
  assert.equal(portal.y, STUDIO_DESTINATION_EXIT.centerY, `${portal.id} must sit in the exit corridor`)
  assert.ok(portal.x > STUDIO_DESTINATION_EXIT.x + 32, `${portal.id} needs clearance from the office doorway`)
  assert.ok(portal.x < STUDIO_DESTINATION_EXIT.x + STUDIO_DESTINATION_EXIT.width - 32, `${portal.id} needs clearance from the play-wing doorway`)
  assert.ok(portal.interactionRadius <= 54, `${portal.id} interaction radius must stay inside the open corridor`)
}
assert.ok(
  Math.abs(studioWorldPortals[0].x - studioWorldPortals[1].x) > studioWorldPortals[0].interactionRadius + studioWorldPortals[1].interactionRadius,
  'Destination portals must not compete for the same interaction radius',
)

for (const stationId of ['JOB_BOARD', ...careerStationIds, 'CAREER_CENTER', 'PAYROLL_OFFICE']) {
  const accessPoint = studioInteractiveObjects.find((object) => object.stationId === stationId)
  assert.ok(accessPoint, `${stationId} must have a shared map access point`)
  assert.equal(getRoomForPosition(accessPoint!.x, accessPoint!.y).id, accessPoint!.roomId)
}

console.log('Studio world tests passed: named wings, physical access points and department stations are aligned')

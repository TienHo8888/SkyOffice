import { Schema, ArraySchema, SetSchema, MapSchema, type } from '@colyseus/schema'
import {
  IPlayer,
  IOfficeState,
  IComputer,
  IWhiteboard,
  IChatMessage,
} from '../../../types/IOfficeState'
import { StudioRole } from '../../../types/Studio'
import { ITagGameParticipant, ITagGameState, TagGameStatus } from '../../../types/TagGame'
import {
  IMiniGameCell,
  IMiniGameItem,
  IMiniGameParticipant,
  IMiniGameState,
  MiniGameMode,
  MiniGameStatus,
} from '../../../types/MiniGame'
import { CasinoGameMode, CasinoPhase, ICasinoSeat, ICasinoTableState } from '../../../types/Casino'

export class Player extends Schema implements IPlayer {
  @type('string') userId = ''
  @type('string') name = ''
  @type('string') role: StudioRole = 'MEMBER'
  @type('number') x = 705
  @type('number') y = 500
  @type('string') anim = 'adam_idle_down'
  @type('string') currentRoom = 'LOBBY'
  @type('boolean') online = true
  @type('boolean') readyToConnect = false
  @type('boolean') videoConnected = false
  @type('string') nameplateId = 'nameplate-basic'
  @type('string') titleId = ''
  @type('string') characterConfigJson = ''
  @type('number') avatarRevision = 1
}

export class Computer extends Schema implements IComputer {
  @type({ set: 'string' }) connectedUser = new SetSchema<string>()
}

export class Whiteboard extends Schema implements IWhiteboard {
  @type('string') roomId = getRoomId()
  @type({ set: 'string' }) connectedUser = new SetSchema<string>()
}

export class ChatMessage extends Schema implements IChatMessage {
  @type('string') author = ''
  @type('number') createdAt = new Date().getTime()
  @type('string') content = ''
}

export class TagGameParticipant extends Schema implements ITagGameParticipant {
  @type('string') userId = ''
  @type('string') displayName = ''
  @type('number') tagCount = 0
  @type('boolean') connected = true
}

export class TagGameState extends Schema implements ITagGameState {
  @type('string') status: TagGameStatus = 'IDLE'
  @type('string') gameId = 'tag'
  @type('string') roundId = ''
  @type('string') startedBy = ''
  @type('string') taggerSessionId = ''
  @type('number') score = 0
  @type('string') settlementStatus: 'NONE' | 'SETTLING' | 'SETTLED' | 'FAILED' = 'NONE'
  @type(['string']) winnerIds = new ArraySchema<string>()
  @type('number') startedAt = 0
  @type('number') endsAt = 0
  @type('string') resultMessage = ''
  @type({ map: TagGameParticipant }) attendees = new MapSchema<TagGameParticipant>()
}

export class MiniGameParticipant extends Schema implements IMiniGameParticipant {
  @type('string') userId = ''
  @type('string') displayName = ''
  @type('string') role = ''
  @type('string') team = ''
  @type('string') color = ''
  @type('number') score = 0
  @type('number') coins = 0
  @type('number') wins = 0
  @type('boolean') connected = true
  @type('boolean') alive = true
  @type('boolean') frozen = false
  @type('boolean') hidden = false
  @type('boolean') found = false
  @type('boolean') hasBomb = false
  @type('string') carryingFlag = ''
  @type('string') choice = ''
}

export class MiniGameItem extends Schema implements IMiniGameItem {
  @type('string') kind = ''
  @type('number') x = 0
  @type('number') y = 0
  @type('number') value = 0
  @type('boolean') active = true
  @type('string') collectedBy = ''
  @type('string') team = ''
  @type('number') homeX = 0
  @type('number') homeY = 0
}

export class MiniGameCell extends Schema implements IMiniGameCell {
  @type('number') index = 0
  @type('string') ownerSessionId = ''
  @type('string') team = ''
}

export class MiniGameState extends Schema implements IMiniGameState {
  @type('string') mode: MiniGameMode | '' = ''
  @type('string') gameId = ''
  @type('string') status: MiniGameStatus = 'IDLE'
  @type('string') roundId = ''
  @type('string') startedBy = ''
  @type('string') leaderSessionId = ''
  @type('string') targetColor = ''
  @type('string') turnTeam = ''
  @type('number') teamRedScore = 0
  @type('number') teamBlueScore = 0
  @type('number') startedAt = 0
  @type('number') endsAt = 0
  @type('number') score = 0
  @type('number') totalTasks = 0
  @type('number') completedTasks = 0
  @type('number') minPlayers = 2
  @type('number') maxPlayers = 8
  @type('number') spectatorCount = 0
  @type('string') settlementStatus: 'NONE' | 'SETTLING' | 'SETTLED' | 'FAILED' = 'NONE'
  @type(['string']) winnerIds = new ArraySchema<string>()
  @type('string') resultMessage = ''
  @type('string') notice = ''
  @type({ map: MiniGameParticipant }) attendees = new MapSchema<MiniGameParticipant>()
  @type({ map: MiniGameItem }) items = new MapSchema<MiniGameItem>()
  @type({ map: MiniGameCell }) boardCells = new MapSchema<MiniGameCell>()
}

export class CasinoSeat extends Schema implements ICasinoSeat {
  @type('string') userId = ''
  @type('string') displayName = ''
  @type('number') seatIndex = 0
  @type('string') wagersJson = '{}'
  @type('string') cards = ''
  @type('string') status = 'WATCHING'
  @type('string') result = ''
  @type('number') stake = 0
  @type('number') payout = 0
  @type('number') net = 0
  @type('number') handValue = 0
  @type('boolean') acted = false
  @type('boolean') doubled = false
  @type('boolean') folded = false
  @type('boolean') win = false
  @type('string') board = ''
  @type('string') lastMove = ''
  @type('string') turn = ''
  @type('number') moveCount = 0
  @type('string') matchId = ''
  @type('string') pokerMode = ''
  @type('string') pvpTableId = ''
  @type('string') pokerStateJson = ''
}

export class CasinoTableState extends Schema implements ICasinoTableState {
  @type('string') mode: CasinoGameMode = 'BACCARAT'
  @type('string') phase: CasinoPhase = 'BETTING'
  @type('string') roundId = ''
  @type('number') roundNumber = 0
  @type('number') phaseStartedAt = 0
  @type('number') phaseEndsAt = 0
  @type('string') dealerName = 'DEALER AI'
  @type('string') statusText = ''
  @type('string') outcome = ''
  @type('string') playerCards = ''
  @type('string') bankerCards = ''
  @type('string') dealerCards = ''
  @type('string') communityCards = ''
  @type('string') dice = ''
  @type('number') playerTotal = 0
  @type('number') bankerTotal = 0
  @type('number') dealerTotal = 0
  @type('string') resultDetail = ''
  @type('string') history = ''
  @type('number') totalWagered = 0
  @type('number') activePlayers = 0
  @type('number') shoeRemaining = 0
  @type('string') pvpLobbyJson = ''
  @type('string') tienLenPublicJson = ''
  @type({ map: CasinoSeat }) seats = new MapSchema<CasinoSeat>()
}

export class OfficeState extends Schema implements IOfficeState {
  @type({ map: Player })
  players = new MapSchema<Player>()

  @type({ map: Computer })
  computers = new MapSchema<Computer>()

  @type({ map: Whiteboard })
  whiteboards = new MapSchema<Whiteboard>()

  @type([ChatMessage])
  chatMessages = new ArraySchema<ChatMessage>()

  @type(TagGameState)
  tagGame = new TagGameState()

  @type(MiniGameState)
  miniGame = new MiniGameState()

  @type({ map: CasinoTableState })
  casinoTables = new MapSchema<CasinoTableState>()
}

export const whiteboardRoomIds = new Set<string>()
const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const charactersLength = characters.length

function getRoomId(): string {
  let result = ''
  for (let i = 0; i < 12; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength))
  }
  if (!whiteboardRoomIds.has(result)) {
    whiteboardRoomIds.add(result)
    return result
  } else {
    console.log('roomId exists, remaking another one.')
    return getRoomId()
  }
}

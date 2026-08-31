export enum RoomType {
  LOBBY = 'lobby',
  PUBLIC = 'skyoffice',
  CUSTOM = 'custom',
  FISHING = 'fishing',
  HOME = 'home',
}

export interface IRoomData {
  name: string
  description: string
  password: string | null
  autoDispose: boolean
}

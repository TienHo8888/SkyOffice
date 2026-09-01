import Phaser from 'phaser'
import { createCharacterAnims } from '../anims/CharacterAnims'
import '../characters/MyPlayer'
import '../characters/OtherPlayer'
import MyPlayer from '../characters/MyPlayer'
import OtherPlayer from '../characters/OtherPlayer'
import PlayerSelector from '../characters/PlayerSelector'
import Network from '../services/Network'
import type { IPlayer } from '../../../types/IOfficeState'
import type { WorldId } from '../../../types/IWorldState'
import type { CharacterConfig } from '../../../types/Avatar'
import { PlayerBehavior } from '../../../types/PlayerBehavior'
import { NavKeys, Keyboard } from '../../../types/KeyboardState'
import store from '../stores'
import { setShowChat } from '../stores/ChatStore'
import { setWorldMapLoading } from '../stores/WorldStore'
import { Event, phaserEvents } from '../events/EventCenter'

export interface WorldSceneData {
  network: Network
}

export interface WorldBounds {
  minX: number
  maxX: number
  minY: number
  maxY: number
}

/**
 * Destination scenes share the same avatar/presence contract as the main
 * office, but deliberately do not know about computers, work zones, casino
 * tables or other office-specific state.
 */
export default abstract class WorldSceneBase extends Phaser.Scene {
  network!: Network
  myPlayer!: MyPlayer
  protected playerSelector!: PlayerSelector
  protected otherPlayers!: Phaser.Physics.Arcade.Group
  protected readonly otherPlayerMap = new Map<string, OtherPlayer>()
  protected cursors!: NavKeys
  protected keyE!: Phaser.Input.Keyboard.Key
  protected keyR!: Phaser.Input.Keyboard.Key
  protected interactionHint!: Phaser.GameObjects.Text
  protected inputLocks = new Set<string>()
  protected activeWorld!: WorldId
  protected bounds!: WorldBounds

  private readonly handleOpenChat = () => store.dispatch(setShowChat(true))
  private readonly handleEscape = () => { void this.network?.returnToPublic() }
  private readonly handleWorldTransitionEvent = (payload: { status?: string }) => {
    if (payload?.status === 'LEAVING' || payload?.status === 'JOINING') this.disableKeys('world-transition')
    if (payload?.status === 'READY' || payload?.status === 'ERROR') this.enableKeys('world-transition')
  }

  protected initializeWorld(data: WorldSceneData, worldId: WorldId, bounds: WorldBounds, spawn: { x: number; y: number }) {
    if (!data?.network) throw new Error('server instance missing')
    this.network = data.network
    this.activeWorld = worldId
    this.bounds = bounds
    createCharacterAnims(this.anims)
    this.registerKeys()

    const savedAvatar = store.getState().user.authUser?.avatarKey || 'adam'
    this.myPlayer = this.add.myPlayer(spawn.x, spawn.y, savedAvatar, this.network.mySessionId)
    this.myPlayer.userId = store.getState().user.authUser?.id || ''
    const savedCharacterConfig = store.getState().user.authUser?.characterConfig
    if (savedCharacterConfig) this.myPlayer.setCharacterConfig(savedCharacterConfig)
    const savedLoadout = store.getState().social.snapshot?.loadout
    this.myPlayer.setNameplate(savedLoadout?.nameplateId || 'nameplate-basic')
    this.myPlayer.setTitle(savedLoadout?.titleId)
    this.myPlayer.playerName.setText(store.getState().user.displayName || store.getState().user.authUser?.displayName || '')

    this.playerSelector = new PlayerSelector(this, spawn.x, spawn.y, 16, 16)
    this.otherPlayers = this.physics.add.group({ classType: OtherPlayer })
    this.interactionHint = this.add.text(spawn.x, spawn.y - 58, '', {
      color: '#f7ffd9',
      fontFamily: 'DM Mono',
      fontSize: '9px',
      fontStyle: 'bold',
      backgroundColor: '#101622dd',
      padding: { left: 5, right: 5, top: 3, bottom: 3 },
    }).setOrigin(0.5).setStroke('#101622', 2).setDepth(7100).setVisible(false)

    this.cameras.main.setZoom(2)
    this.cameras.main.setBounds(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY)
    this.cameras.main.setRoundPixels(true)
    this.cameras.main.startFollow(this.myPlayer, true)
    this.physics.world.setBounds(bounds.minX, bounds.minY, bounds.maxX - bounds.minX, bounds.maxY - bounds.minY)
    this.myPlayer.setCollideWorldBounds(true)

    this.network.onPlayerJoined(this.handlePlayerJoined, this)
    this.network.onPlayerLeft(this.handlePlayerLeft, this)
    this.network.onMyPlayerReady(this.handleMyPlayerReady, this)
    this.network.onMyPlayerVideoConnected(this.handleMyVideoConnected, this)
    this.network.onPlayerUpdated(this.handlePlayerUpdated, this)
    this.network.onChatMessageAdded(this.handleChatMessageAdded, this)
    phaserEvents.on(Event.MY_PLAYER_NAMEPLATE_CHANGE, this.handleMyPlayerNameplateChange, this)
    phaserEvents.on(Event.MY_PLAYER_TITLE_CHANGE, this.handleMyPlayerTitleChange, this)
    phaserEvents.on(Event.PLAYER_MOVEMENT_CORRECTION, this.handlePlayerMovementCorrection, this)
    phaserEvents.on(Event.SOCIAL_EMOTE, this.handleSocialEmote, this)
    phaserEvents.on(Event.WORLD_TRANSITION, this.handleWorldTransitionEvent, this)

    // State may already contain people when the scene is started. The
    // explicit sync keeps destination scenes correct even if no later patch
    // changes a remote player's name.
    this.network.getPlayers()?.forEach((player, sessionId) => {
      if (sessionId !== this.network.mySessionId) this.handlePlayerJoined(player, sessionId)
    })
    this.enableKeys('world-transition')
    store.dispatch(setWorldMapLoading('READY'))

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupWorld, this)
  }

  protected updateWorld(_time: number, _delta: number) {
    if (!this.myPlayer || !this.network) return
    if (this.inputLocks.size === 0) {
      this.myPlayer.update(this.playerSelector, this.cursors, this.keyE, this.keyR, this.network)
      this.playerSelector.update(this.myPlayer, this.cursors)
      this.updateWorldInteraction()
    } else {
      this.myPlayer.setVelocity(0, 0)
      this.interactionHint?.setVisible(false)
    }
  }

  protected updateWorldInteraction() {
    // Destination-specific scenes override this method.
  }

  protected handleWorldInteraction() {
    if (this.inputLocks.size > 0) return
    this.onWorldInteract()
  }

  protected onWorldInteract() {
    // Destination-specific scenes override this method.
  }

  protected showInteractionHint(text: string, x = this.myPlayer.x, y = this.myPlayer.y - 58) {
    this.interactionHint.setText(text).setPosition(x, y).setVisible(Boolean(text))
  }

  disableKeys(lock = 'world-ui') {
    this.inputLocks.add(lock)
    if (this.input?.keyboard) this.input.keyboard.enabled = false
  }

  enableKeys(lock = 'world-ui') {
    this.inputLocks.delete(lock)
    if (this.input?.keyboard) this.input.keyboard.enabled = this.inputLocks.size === 0
  }

  protected registerKeys() {
    this.cursors = {
      ...this.input.keyboard.createCursorKeys(),
      ...(this.input.keyboard.addKeys('W,S,A,D') as Keyboard),
    }
    this.keyE = this.input.keyboard.addKey('E')
    this.keyR = this.input.keyboard.addKey('R')
    this.input.keyboard.off('keydown-E', this.handleWorldInteraction, this)
    this.input.keyboard.on('keydown-E', this.handleWorldInteraction, this)
    this.input.keyboard.disableGlobalCapture()
    this.input.keyboard.off('keydown-ENTER', this.handleOpenChat, this)
    this.input.keyboard.off('keydown-ESC', this.handleEscape, this)
    this.input.keyboard.on('keydown-ENTER', this.handleOpenChat, this)
    this.input.keyboard.on('keydown-ESC', this.handleEscape, this)
  }

  private handlePlayerJoined(newPlayer: IPlayer, id: string) {
    if (!newPlayer || id === this.network.mySessionId || this.otherPlayerMap.has(id)) return
    const texture = newPlayer.anim.split('_')[0] || 'adam'
    const otherPlayer = this.add.otherPlayer(newPlayer.x, newPlayer.y, texture, id, newPlayer.name)
    otherPlayer.userId = newPlayer.userId
    if (newPlayer.characterConfigJson) {
      try { otherPlayer.setCharacterConfig(JSON.parse(newPlayer.characterConfigJson) as CharacterConfig) } catch { /* legacy player */ }
    }
    otherPlayer.setNameplate(newPlayer.nameplateId || 'nameplate-basic')
    otherPlayer.setTitle(newPlayer.titleId)
    this.otherPlayers.add(otherPlayer)
    this.otherPlayerMap.set(id, otherPlayer)
  }

  private handlePlayerLeft(id: string) {
    const otherPlayer = this.otherPlayerMap.get(id)
    if (!otherPlayer) return
    this.otherPlayers.remove(otherPlayer, true, true)
    this.otherPlayerMap.delete(id)
  }

  private handleMyPlayerReady() {
    if (this.myPlayer) this.myPlayer.readyToConnect = true
  }

  private handleMyVideoConnected() {
    if (this.myPlayer) this.myPlayer.videoConnected = true
  }

  private handleMyPlayerNameplateChange(nameplateId?: string) {
    const social = store.getState().social.snapshot
    this.myPlayer?.setNameplate(nameplateId || social?.loadout.nameplateId || 'nameplate-basic')
  }

  private handleMyPlayerTitleChange(titleId?: string) {
    const social = store.getState().social.snapshot
    this.myPlayer?.setTitle(titleId !== undefined ? titleId : social?.loadout.titleId)
  }

  private handlePlayerUpdated(field: string, value: number | string | boolean, id: string) {
    this.otherPlayerMap.get(id)?.updateOtherPlayer(field, value)
  }

  private handleChatMessageAdded(playerId: string, content: string) {
    this.otherPlayerMap.get(playerId)?.updateDialogBubble(content)
  }

  private handleSocialEmote(payload: { sessionId: string; emoteId: string }) {
    const target = payload.sessionId === this.network?.mySessionId ? this.myPlayer : this.otherPlayerMap.get(payload.sessionId)
    if (!target) return
    const labels: Record<string, string> = { WAVE: '👋', HEART: '💚', CLAP: '👏', COFFEE: '☕', GG: 'GG!', THINK: '🤔' }
    const emote = this.add.text(target.x, target.y - 78, labels[payload.emoteId] || '✦', {
      color: '#f4ffd7', fontFamily: 'DM Mono', fontSize: payload.emoteId === 'GG' ? '12px' : '18px', fontStyle: 'bold', backgroundColor: '#101622dd', padding: { left: 5, right: 5, top: 3, bottom: 3 },
    }).setOrigin(0.5).setStroke('#101622', 2).setDepth(7100)
    this.tweens.add({ targets: emote, y: emote.y - 26, alpha: 0, duration: 1150, ease: 'Sine.easeOut', onComplete: () => emote.destroy() })
  }

  private handlePlayerMovementCorrection(payload: { x?: number; y?: number; anim?: string }) {
    if (!this.myPlayer || payload?.x === undefined || payload?.y === undefined) return
    this.myPlayer.setVelocity(0, 0).setPosition(Number(payload.x), Number(payload.y)).setDepth(Number(payload.y))
    this.playerSelector?.setPosition(Number(payload.x), Number(payload.y))
    if (payload.anim && /^[a-zA-Z0-9_-]{1,100}$/.test(payload.anim)) this.myPlayer.playAnimation(payload.anim, true)
  }

  private cleanupWorld() {
    phaserEvents.off(Event.PLAYER_JOINED, this.handlePlayerJoined, this)
    phaserEvents.off(Event.PLAYER_LEFT, this.handlePlayerLeft, this)
    phaserEvents.off(Event.MY_PLAYER_READY, this.handleMyPlayerReady, this)
    phaserEvents.off(Event.MY_PLAYER_VIDEO_CONNECTED, this.handleMyVideoConnected, this)
    phaserEvents.off(Event.PLAYER_UPDATED, this.handlePlayerUpdated, this)
    phaserEvents.off(Event.UPDATE_DIALOG_BUBBLE, this.handleChatMessageAdded, this)
    phaserEvents.off(Event.MY_PLAYER_NAMEPLATE_CHANGE, this.handleMyPlayerNameplateChange, this)
    phaserEvents.off(Event.MY_PLAYER_TITLE_CHANGE, this.handleMyPlayerTitleChange, this)
    phaserEvents.off(Event.PLAYER_MOVEMENT_CORRECTION, this.handlePlayerMovementCorrection, this)
    phaserEvents.off(Event.SOCIAL_EMOTE, this.handleSocialEmote, this)
    phaserEvents.off(Event.WORLD_TRANSITION, this.handleWorldTransitionEvent, this)
    this.input.keyboard?.off('keydown-E', this.handleWorldInteraction, this)
    this.input.keyboard?.off('keydown-ENTER', this.handleOpenChat, this)
    this.input.keyboard?.off('keydown-ESC', this.handleEscape, this)
    this.input.keyboard?.removeAllKeys(true)
    this.inputLocks.clear()
    this.otherPlayerMap.clear()
  }
}

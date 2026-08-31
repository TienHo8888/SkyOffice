import Phaser from 'phaser'
import { PlayerBehavior } from '../../../types/PlayerBehavior'
import { CharacterConfig } from '../../../types/Avatar'
import type { AvatarDirection } from '../../../types/Avatar'
import type { FishingPhase, FishingSpotDefinition } from '../../../types/Fishing'
import { getSocialTitle } from '../../../types/Social'
import LpcLayeredCharacterRenderer from './LpcLayeredCharacterRenderer'
import FishingActionVisual from './FishingActionVisual'
/**
 * shifting distance for sitting animation
 * format: direction: [xShift, yShift, depthShift]
 */
export const sittingShiftData = {
  up: [0, 3, -10],
  down: [0, 3, 1],
  left: [0, -8, 10],
  right: [0, -8, 10],
}

export default class Player extends Phaser.Physics.Arcade.Sprite {
  playerId: string
  userId = ''
  playerTexture: string
  playerBehavior = PlayerBehavior.IDLE
  readyToConnect = false
  videoConnected = false
  playerName: Phaser.GameObjects.Text
  playerTitle: Phaser.GameObjects.Text
  playerNameplate: Phaser.GameObjects.Text
  playerContainer: Phaser.GameObjects.Container
  private lpcRenderer?: LpcLayeredCharacterRenderer
  characterConfig?: CharacterConfig
  private playerDialogBubble: Phaser.GameObjects.Container
  private tagGameMarker: Phaser.GameObjects.Text
  private timeoutID?: number
  private fishingVisual?: FishingActionVisual
  private fishingDirection: AvatarDirection = 'right'

  /**
   * The LPC renderer is a separate container because the legacy sprite still
   * owns the Arcade body. Sync it from POST_UPDATE so the visual layer reads
   * the final, collision-resolved position for this frame instead of being one
   * physics step behind.
   */
  private syncLpcRenderer = (time: number) => {
    // The nameplate/dialog container used to have a second Arcade body and
    // could be resolved a fraction differently from the player's real body.
    // It is presentation-only, so keep it pinned to the final player position
    // after physics instead of letting two bodies fight over the same avatar.
    this.playerContainer.setPosition(Math.round(this.x), Math.round(this.y) - 30)

    if (this.lpcRenderer?.container.visible) {
      this.lpcRenderer.setPosition(this.x, this.y)
      this.lpcRenderer.setDepth(this.depth)
      this.lpcRenderer.update(time)
    }
    this.fishingVisual?.update(time, this.x, this.y, this.depth)
  }

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    id: string,
    frame?: string | number
  ) {
    super(scene, x, y, texture, frame)

    this.playerId = id
    this.playerTexture = texture
    this.setDepth(this.y)

    this.playAnimation(`${this.playerTexture}_idle_down`, true)

    // Keep the identity/chat overlay above the world's interaction prompt so
    // the speech-tail remains visible when the speaker is near a workstation.
    this.playerContainer = this.scene.add.container(this.x, this.y - 30).setDepth(7000)

    // add dialogBubble to playerContainer
    this.playerDialogBubble = this.scene.add.container(0, 0).setDepth(7000)
    this.playerContainer.add(this.playerDialogBubble)

    // add playerName to playerContainer
    this.playerName = this.scene.add
      .text(0, -4, '', {
        color: '#f5f8ed',
        fontFamily: 'DM Mono',
        // Keep the name compact while leaving room for the title above it.
        // This is approximately 30% smaller than the original 14px label.
        fontSize: '10px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 1)
      .setStroke('#101622', 3)
      .setResolution(2)
    this.playerContainer.add(this.playerName)

    this.playerTitle = this.scene.add
      .text(0, -18, '', {
        color: '#c8f267',
        fontFamily: 'DM Mono',
        fontSize: '8px',
        fontStyle: 'bold',
      })
      .setOrigin(0.5, 1)
      .setStroke('#101622', 2)
      .setResolution(2)
      .setVisible(false)
    this.playerContainer.add(this.playerTitle)

    this.playerNameplate = this.scene.add
      .text(0, -20, '', { color: '#6b4f1d', fontFamily: 'DM Mono', fontSize: '8px', fontStyle: 'bold', backgroundColor: '#ffe08a', padding: { left: 4, right: 4, top: 2, bottom: 2 } })
      .setOrigin(0.5)
      .setResolution(2)
      .setVisible(false)
    this.playerContainer.add(this.playerNameplate)

    this.tagGameMarker = this.scene.add
      .text(0, -14, '⚡', { color: '#ff6b6b', fontFamily: 'Arial', fontSize: '13px' })
      .setOrigin(0.5)
      .setVisible(false)
    this.playerContainer.add(this.tagGameMarker)

    // The bubble is transient feedback and must sit above every label. Phaser
    // containers render children in insertion order, so keep it at the top
    // after the name/title/nameplate have been added.
    this.playerContainer.bringToTop(this.playerDialogBubble)

    this.scene.physics.world.enable(this.playerContainer)
    const playContainerBody = this.playerContainer.body as Phaser.Physics.Arcade.Body
    const collisionScale = [0.5, 0.2]
    playContainerBody
      .setSize(this.width * collisionScale[0], this.height * collisionScale[1])
      .setOffset(-8, this.height * (1 - collisionScale[1]) + 6)
      // The container only owns labels and chat bubbles. Colliding it in
      // parallel with the player body causes visible micro-corrections at
      // walls and corners, especially with the layered LPC visual.
      .setEnable(false)

    this.scene.events.on(Phaser.Scenes.Events.POST_UPDATE, this.syncLpcRenderer, this)
  }

  updateDialogBubble(content: string) {
    this.clearDialogBubble()

    // preprocessing for dialog bubble text (maximum 70 characters)
    const dialogBubbleText = content.length <= 70 ? content : content.substring(0, 70).concat('...')

    const innerText = this.scene.add
      .text(0, 0, dialogBubbleText, { wordWrap: { width: 165, useAdvancedWrap: true } })
      .setFontFamily('Arial')
      .setFontSize(14)
      .setResolution(2)
      .setColor('#000000')
      .setOrigin(0.5)

    // set dialogBox slightly larger than the text in it
    const innerTextHeight = innerText.height
    const innerTextWidth = innerText.width

    const dialogBoxWidth = innerTextWidth + 10
    const dialogBoxHeight = innerTextHeight + 3
    const dialogBoxX = innerText.x - innerTextWidth / 2 - 5
    // Keep the speech toast above the complete identity stack. The previous
    // position only accounted for the player name, so an active title or
    // nameplate could sit underneath the bubble and become unreadable.
    const bubbleGap = 12
    const bubbleBottom = this.getLabelTop() - bubbleGap
    const dialogBoxY = bubbleBottom - dialogBoxHeight
    innerText.setY(dialogBoxY + dialogBoxHeight / 2)

    // Give the in-world chat toast a small tail so it is visually anchored to
    // the character who is speaking. Draw the tail before the bubble body so
    // the body's bottom border cleanly covers the tail's base.
    const tailBaseY = bubbleBottom - 1
    const tailTipY = bubbleBottom + 8
    const tailOuterHalfWidth = 7
    const tailInnerHalfWidth = 5
    this.playerDialogBubble.add(
      this.scene.add
        .graphics()
        .fillStyle(0x000000, 1)
        .fillTriangle(0, tailTipY, -tailOuterHalfWidth, tailBaseY, tailOuterHalfWidth, tailBaseY)
        .fillStyle(0xffffff, 1)
        .fillTriangle(0, tailTipY - 2, -tailInnerHalfWidth, tailBaseY, tailInnerHalfWidth, tailBaseY)
        .fillStyle(0xffffff, 1)
        .fillRoundedRect(dialogBoxX, dialogBoxY, dialogBoxWidth, dialogBoxHeight, 3)
        .lineStyle(1, 0x000000, 1)
        .strokeRoundedRect(dialogBoxX, dialogBoxY, dialogBoxWidth, dialogBoxHeight, 3)
    )
    this.playerDialogBubble.add(innerText)
    this.playerContainer.bringToTop(this.playerDialogBubble)

    // After 6 seconds, clear the dialog bubble
    this.timeoutID = window.setTimeout(() => {
      this.clearDialogBubble()
    }, 6000)
  }

  setTagGameTagger(isTagger: boolean) {
    this.tagGameMarker.setVisible(isTagger)
    this.playerName.setColor(isTagger ? '#ff8b8b' : '#f5f8ed')
    if (isTagger) this.setTint(0xffc2a5)
    else this.clearTint()
  }

  playAnimation(animationKey: string, ignoreIfPlaying = false) {
    this.anims.play(animationKey, ignoreIfPlaying)
    this.lpcRenderer?.setAnimation(animationKey)
    return this
  }

  playFishingAnimation(phase: FishingPhase, spot: FishingSpotDefinition) {
    const dx = spot.x - this.x
    const dy = spot.y - this.y
    this.fishingDirection = Math.abs(dx) >= Math.abs(dy)
      ? dx < 0 ? 'left' : 'right'
      : dy < 0 ? 'up' : 'down'

    if (!this.fishingVisual) this.fishingVisual = new FishingActionVisual(this.scene)
    this.fishingVisual.setPhase(phase, spot, this.x, this.y)

    // The layered LPC avatar already ships with action sheets. The legacy
    // sprite has no fishing-specific frames, so it keeps its current pose
    // while the rod/line/bobber visual still performs the full action.
    const action = phase === 'MISSED' ? 'hurt' : phase === 'BITE' || phase === 'REELING' ? 'thrust' : 'shoot'
    const actionKey = `${this.playerTexture}_${action}_${this.fishingDirection}`
    if (this.scene.anims.exists(actionKey)) this.anims.play(actionKey, true)
    this.lpcRenderer?.setAnimation(actionKey)
    return this
  }

  stopFishingAnimation() {
    this.fishingVisual?.stop()
    const idleKey = `${this.playerTexture}_idle_${this.fishingDirection}`
    if (this.scene?.anims?.exists(idleKey)) this.anims.play(idleKey, true)
    this.lpcRenderer?.setAnimation(idleKey)
    return this
  }

  setCharacterConfig(config?: CharacterConfig) {
    this.characterConfig = config
    if (!config) {
      this.setVisible(true)
      this.lpcRenderer?.container.setVisible(false)
      return
    }
    if (!this.lpcRenderer) this.lpcRenderer = new LpcLayeredCharacterRenderer(this.scene)
    this.lpcRenderer.setConfig(config)
    this.lpcRenderer.setPosition(this.x, this.y)
    this.lpcRenderer.setDepth(this.depth)
    this.setVisible(false)
    this.lpcRenderer.setAnimation(this.anims.currentAnim?.key || `${this.playerTexture}_idle_down`)
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta)
  }

  destroy(fromScene?: boolean) {
    // Phaser may clear the scene reference before UpdateList.shutdown calls
    // destroy(). Destination transitions still need this cleanup to be
    // idempotent, so guard objects that may already have been detached.
    this.scene?.events?.off(Phaser.Scenes.Events.POST_UPDATE, this.syncLpcRenderer, this)
    this.playerContainer?.destroy()
    this.fishingVisual?.destroy()
    this.lpcRenderer?.destroy()
    super.destroy(fromScene)
  }

  setNameplate(nameplateId: string) {
    const nameplates: Record<string, { label: string; color: string; background: string }> = {
      'nameplate-neon': { label: 'NEON', color: '#211b42', background: '#ae91ff' },
      'nameplate-champion': { label: 'CHAMPION', color: '#392715', background: '#ffb86c' },
      'nameplate-lucky': { label: 'LUCKY', color: '#233019', background: '#c8f267' },
    }
    const style = nameplates[nameplateId]
    this.playerNameplate.setVisible(Boolean(style))
    if (style) {
      this.playerNameplate.setText(style.label).setColor(style.color).setBackgroundColor(style.background)
    } else this.playerNameplate.setText('')
    this.refreshLabelLayout()
  }

  setTitle(titleId?: string) {
    const title = getSocialTitle(titleId)
    this.playerTitle.setVisible(Boolean(title))
    if (!title) {
      this.playerTitle.setText('')
      this.refreshLabelLayout()
      return
    }
    this.playerTitle
      .setText(title.name)
      .setColor(title.color)
    this.refreshLabelLayout()
  }

  protected refreshLabelLayout() {
    this.playerName.setY(-4)
    let nextLabelBottom = this.playerName.y - this.playerName.height - 2

    if (this.playerTitle.visible) {
      this.playerTitle.setY(nextLabelBottom)
      nextLabelBottom = this.playerTitle.y - this.playerTitle.height - 3
    } else {
      this.playerTitle.setY(-18)
    }

    if (this.playerNameplate.visible) {
      this.playerNameplate.setY(nextLabelBottom - this.playerNameplate.height / 2)
    } else {
      this.playerNameplate.setY(-20)
    }
  }

  private getLabelTop() {
    const labelTops = [this.playerName.y - this.playerName.height]

    if (this.playerTitle.visible) {
      labelTops.push(this.playerTitle.y - this.playerTitle.height)
    }

    if (this.playerNameplate.visible) {
      labelTops.push(this.playerNameplate.y - this.playerNameplate.height / 2)
    }

    return Math.min(...labelTops)
  }

  private clearDialogBubble() {
    clearTimeout(this.timeoutID)
    this.playerDialogBubble.removeAll(true)
  }
}

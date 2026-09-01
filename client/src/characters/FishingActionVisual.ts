import Phaser from 'phaser'
import { FISHING_TIMING } from '../../../types/Fishing'
import type { FishingPhase, FishingSpotDefinition } from '../../../types/Fishing'
import type { AvatarDirection } from '../../../types/Avatar'

const phaseDurationMs = {
  CASTING: FISHING_TIMING.castDelaySeconds * 1000,
  NIBBLE: 280,
  BITE: 220,
  REELING: FISHING_TIMING.reelDelaySeconds * 1000,
  MISSED: 800,
}

function fishingDirection(playerX: number, playerY: number, spot: FishingSpotDefinition): AvatarDirection {
  const dx = spot.castX - playerX
  const dy = spot.castY - playerY
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? 'left' : 'right'
  return dy < 0 ? 'up' : 'down'
}

/**
 * Draws the fishing tool and water feedback in world space. The visual is
 * deliberately Phaser-owned so it works with both the legacy sprite and the
 * layered LPC avatar without baking a fishing rod into every outfit sheet.
 */
export default class FishingActionVisual {
  private readonly container: Phaser.GameObjects.Container
  private readonly graphics: Phaser.GameObjects.Graphics
  private readonly label: Phaser.GameObjects.Text
  private phase: FishingPhase = 'IDLE'
  private spot?: FishingSpotDefinition
  private direction: AvatarDirection = 'right'
  private phaseStartedAt = 0

  constructor(private readonly scene: Phaser.Scene) {
    this.container = scene.add.container(0, 0).setVisible(false)
    this.graphics = scene.add.graphics()
    this.label = scene.add.text(0, -70, '', {
      color: '#f6ffd8',
      fontFamily: 'DM Mono',
      fontSize: '8px',
      fontStyle: 'bold',
      backgroundColor: '#10233ddd',
      padding: { left: 5, right: 5, top: 3, bottom: 3 },
    }).setOrigin(0.5).setStroke('#10233d', 2).setResolution(2).setVisible(false)
    this.container.add(this.graphics)
    this.container.add(this.label)
  }

  setPhase(phase: FishingPhase, spot: FishingSpotDefinition, playerX: number, playerY: number) {
    if (phase === 'IDLE') {
      this.stop()
      return
    }
    this.phase = phase
    this.spot = spot
    this.direction = fishingDirection(playerX, playerY, spot)
    this.phaseStartedAt = this.scene.time.now
    this.container.setVisible(true)
    this.update(this.phaseStartedAt, playerX, playerY, playerY)
  }

  update(time: number, playerX: number, playerY: number, depth: number) {
    if (this.phase === 'IDLE' || !this.spot || !this.container.visible) return

    this.container.setPosition(Math.round(playerX), Math.round(playerY)).setDepth(Math.round(depth) + 8)
    const elapsed = Math.max(0, time - this.phaseStartedAt)
    const targetX = this.spot.castX - playerX
    const targetY = this.spot.castY - playerY - 5
    const rodSide = this.direction === 'left' ? -1 : 1
    const rodBaseX = rodSide * 6
    const rodBaseY = this.direction === 'down' ? -16 : -22
    const rodTipX = rodSide * 30
    const rodTipY = this.direction === 'down' ? -30 : -47

    let bobberX = targetX
    let bobberY = targetY
    if (this.phase === 'CASTING') {
      const progress = Phaser.Math.Clamp(elapsed / phaseDurationMs.CASTING, 0, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      bobberX = Phaser.Math.Linear(rodTipX, targetX, eased)
      const castDistance = Phaser.Math.Distance.Between(0, 0, targetX, targetY)
      const castLift = Math.min(46, 24 + castDistance * 0.08)
      bobberY = Phaser.Math.Linear(rodTipY, targetY, eased) - Math.sin(progress * Math.PI) * castLift
    } else if (this.phase === 'WAITING') {
      bobberY += Math.sin(time / 115) * 1.5
    } else if (this.phase === 'NIBBLE') {
      const progress = Phaser.Math.Clamp(elapsed / phaseDurationMs.NIBBLE, 0, 1)
      bobberY += 3 + Math.sin(progress * Math.PI * 3) * 3
    } else if (this.phase === 'BITE') {
      const progress = Phaser.Math.Clamp(elapsed / phaseDurationMs.BITE, 0, 1)
      bobberY += 7 + Math.sin(progress * Math.PI * 4) * 5
    } else if (this.phase === 'REELING') {
      const progress = Phaser.Math.Clamp(elapsed / phaseDurationMs.REELING, 0, 1)
      const eased = progress * progress
      bobberX = Phaser.Math.Linear(targetX, rodTipX, eased)
      bobberY = Phaser.Math.Linear(targetY + 5, rodTipY + 7, eased) - Math.sin(progress * Math.PI) * 12
    } else if (this.phase === 'MISSED') {
      const progress = Phaser.Math.Clamp(elapsed / phaseDurationMs.MISSED, 0, 1)
      bobberX = targetX + rodSide * progress * 24
      bobberY = targetY - Math.sin(progress * Math.PI) * 15
    }

    const rippleCycle = (time % 420) / 420
    const graphics = this.graphics.clear()
    if (this.phase !== 'CASTING') {
      const rippleStrength = this.phase === 'BITE' || this.phase === 'MISSED' ? 1 : 0.55
      graphics.lineStyle(2, 0x9ce8ff, (1 - rippleCycle) * rippleStrength)
      graphics.strokeEllipse(targetX, targetY + 5, 18 + rippleCycle * 28, 6 + rippleCycle * 10)
      if (this.phase === 'BITE') {
        graphics.lineStyle(2, 0xc8f267, 0.8)
        graphics.strokeEllipse(targetX, targetY + 5, 38, 14)
      }
    }

    // Fishing line: dark outline first so it remains readable on both water
    // and bright grass, followed by a pale inner filament.
    graphics.lineStyle(3, 0x10233d, 0.9).lineBetween(rodTipX, rodTipY, bobberX, bobberY)
    graphics.lineStyle(1, 0xe7f7ef, 0.95).lineBetween(rodTipX, rodTipY, bobberX, bobberY)

    // Rod and handle.
    graphics.lineStyle(5, 0x17202c, 1).lineBetween(rodBaseX, rodBaseY, rodTipX, rodTipY)
    graphics.lineStyle(3, 0xc98c52, 1).lineBetween(rodBaseX, rodBaseY, rodTipX, rodTipY)
    graphics.lineStyle(4, 0x5d3829, 1).lineBetween(rodBaseX, rodBaseY, rodBaseX - rodSide * 5, rodBaseY + 8)

    if (this.phase === 'REELING') this.drawFish(graphics, bobberX - rodSide * 8, bobberY + 8, rodSide)

    // Bobber with a dark pixel-art outline.
    graphics.fillStyle(0x10233d, 1).fillCircle(bobberX, bobberY, 6)
    graphics.fillStyle(0xff6f78, 1).fillCircle(bobberX, bobberY - 1, 4)
    graphics.fillStyle(0xf7f3d0, 1).fillRect(bobberX - 3, bobberY, 6, 3)

    const labels: Record<Exclude<FishingPhase, 'IDLE'>, string> = {
      CASTING: 'THẢ CÂU!',
      WAITING: 'ĐANG CHỜ…',
      NIBBLE: '… CỤC …',
      BITE: '! CÁ CẮN !',
      REELING: 'KÉO CÁ!',
      MISSED: 'HỤT MẤT!',
    }
    const labelAtBobber = this.phase === 'NIBBLE' || this.phase === 'BITE' || this.phase === 'REELING' || this.phase === 'MISSED'
    this.label
      .setText(labels[this.phase])
      .setColor(this.phase === 'BITE' ? '#dfff77' : this.phase === 'REELING' ? '#ffd29a' : '#dff6ff')
      .setPosition(labelAtBobber ? bobberX : 0, labelAtBobber ? bobberY - 23 : -70)
      .setScale(this.phase === 'BITE' ? 1 + Math.sin(elapsed / 35) * 0.08 : 1)
      .setVisible(true)
  }

  stop() {
    this.phase = 'IDLE'
    this.spot = undefined
    this.graphics.clear()
    this.label.setVisible(false).setScale(1)
    this.container.setVisible(false)
  }

  destroy() {
    this.stop()
    this.container.destroy(true)
  }

  private drawFish(graphics: Phaser.GameObjects.Graphics, x: number, y: number, direction: number) {
    graphics.fillStyle(0x10233d, 1)
    graphics.fillTriangle(x - direction * 7, y, x - direction * 16, y - 7, x - direction * 16, y + 7)
    graphics.fillEllipse(x, y, 20, 12)
    graphics.fillStyle(0x8ed8d2, 1)
    graphics.fillTriangle(x - direction * 6, y, x - direction * 14, y - 5, x - direction * 14, y + 5)
    graphics.fillEllipse(x, y, 16, 9)
    graphics.fillStyle(0xf7f3d0, 1).fillCircle(x + direction * 4, y - 1, 1.5)
  }
}

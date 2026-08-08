'use client'

import { useGame } from './useGame'
import { TitleScreen } from './TitleScreen'
import { Hud } from './Hud'
import { InventoryPanel } from './InventoryPanel'
import { CraftingPanel } from './CraftingPanel'
import { PauseMenu, DeathScreen, WinScreen } from './Overlays'

export function GameCanvas() {
  const { canvasRef, snap, cmd, hasSave, startGame, continueGame, deleteSave, submitRun } = useGame()

  return (
    <div className="eldoria-root fixed inset-0 overflow-hidden">
      <canvas
        ref={canvasRef}
        className="game-canvas absolute inset-0 w-full h-full"
        style={{ imageRendering: 'pixelated' }}
      />

      {/* In-game HUD */}
      {snap.screen === 'game' && !snap.paused && (
        <Hud
          s={snap}
          onUseItem={(i) => cmd({ type: 'useItem', index: i })}
          onToggleMusic={() => cmd({ type: 'toggleMusic' })}
        />
      )}

      {/* Inventory */}
      {snap.screen === 'game' && snap.showInventory && !snap.paused && (
        <InventoryPanel
          s={snap}
onUseItem={(i) => cmd({ type: 'useItem', index: i })}
          onEquip={(i) => cmd({ type: 'equip', index: i })}
          onDrop={(i) => cmd({ type: 'dropItem', index: i })}
          onDiscard={(i) => cmd({ type: 'discardItem', index: i })}
          onClose={() => cmd({ type: 'toggleInventory' })}
        />
      )}

      {/* Crafting */}
      {snap.screen === 'game' && snap.showCrafting && !snap.paused && (
        <CraftingPanel
          s={snap}
          onCraft={(id) => cmd({ type: 'craft', recipeId: id })}
          onClose={() => cmd({ type: 'toggleCrafting' })}
        />
      )}

      {/* Pause */}
      {snap.screen === 'game' && snap.paused && (
        <PauseMenu
          s={snap}
          onResume={() => cmd({ type: 'resume' })}
          onQuit={() => cmd({ type: 'quitToTitle' })}
          onSave={() => cmd({ type: 'save' })}
        />
      )}

      {/* Death */}
      {snap.screen === 'dead' && (
        <DeathScreen
          s={snap}
          onRespawn={() => cmd({ type: 'respawn' })}
          onQuit={() => cmd({ type: 'quitToTitle' })}
        />
      )}

      {/* Win */}
      {snap.screen === 'win' && (
        <WinScreen
          s={snap}
          onSubmit={async () => { await submitRun(); cmd({ type: 'quitToTitle' }) }}
          onQuit={() => cmd({ type: 'quitToTitle' })}
        />
      )}

      {/* Title / class select */}
      {(snap.screen === 'title' || snap.screen === 'class') && (
        <TitleScreen
          hasSave={hasSave}
          onStart={startGame}
          onContinue={continueGame}
          onDeleteSave={deleteSave}
        />
      )}
    </div>
  )
}

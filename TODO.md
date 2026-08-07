# TODO — Progressão do Jogador + Inventário de 12 slots

## Steps
- [x] 1. Adicionar `MAX_INVENTORY = 12` em `src/lib/game/data.ts`
- [x] 2. Bônus de XP (+50%) ao matar criaturas da noite (`engine.ts` — `killEnemy`)
- [x] 3. Escalar dano do jogador com nível (+5%/nível) em `engine.ts` (`dealMeleeDamage` + `attack` ranged)
- [x] 4. Limitar inventário a 12 slots em `engine.ts` (`addItem`, `canFit`, `craft`, `updateDrops`)
- [x] 5. Exibir grade fixa de 12 slots em `InventoryPanel.tsx`
- [x] 6. Rodar build/typecheck para validar

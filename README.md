# Eldoria Online

RPG pixel-art isekai souls-like 2D, jogável no navegador. Combate souls-like (parry, esquiva com i-frames, combos, ataques carregados), sobrevivência (fome/sede/stamina), farming de inimigos e plantações, crafting, masmorras procedurais, e dois caminhos de ascensão (Paladino na Capela, Mago na Torre noturna).

Mundo **100% procedural** — cada nova partida gera um mapa único (lagos, rios, florestas, ruínas, veios de minério, inimigos e estruturas em posições diferentes).

## Stack

- **Next.js 16** (App Router) + **TypeScript**
- **Tailwind CSS 4** + **shadcn/ui**
- **Canvas 2D** para o jogo (engine próprio, ~3000 linhas)
- **Web Audio API** para música procedural de fantasia
- **localStorage** para save/load (sem banco de dados — funciona em qualquer host)

## Rodar localmente

```bash
bun install
bun run dev
```

Abra http://localhost:3000 no navegador.

## Deploy na Vercel

O jogo usa **localStorage** para saves (sem banco de dados), então deploya direto na Vercel sem configuração de ambiente.

### Opção A — Deploy via Dashboard (mais fácil)

1. Suba o código para um repositório no GitHub:
   ```bash
   git init
   git add -A
   git commit -m "Eldoria Online"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/eldoria-online.git
   git push -u origin main
   ```

2. Vá em [vercel.com](https://vercel.com) → **Add New** → **Project**

3. Importe o repositório do GitHub

4. A Vercel detecta o Next.js automaticamente. **Não precisa configurar nada** — basta clicar em **Deploy**:
   - Framework Preset: Next.js (auto-detectado)
   - Build Command: `next build` (auto)
   - Output: deixe vazio (a Vercel usa o build padrão do Next.js)
   - Environment Variables: **nenhuma necessária**

5. Em ~1 minuto o deploy fica pronto. Sua URL será `eldoria-online.vercel.app` (ou similar).

### Opção B — Deploy via Vercel CLI

```bash
npm i -g vercel
vercel          # primeiro deploy (preview)
vercel --prod   # promover para produção
```

## Notas

- O `output: "standalone"` no `next.config.ts` é ignorado na Vercel (lá o build é gerenciado automaticamente). Serve para self-hosting (Docker/VPS).
- Saves ficam no **localStorage do navegador** do jogador. Limpar dados do navegador = apagar o save. Para sincronização entre dispositivos, seria necessário um banco (ex: Neon Postgres + Prisma).
- O ranking/leaderboard também é local (por navegador).
- Ícone do app: `public/game/icon.png` (pixel-art de fantasia).
- Arte de título: `public/game/title-art.png`.

## Controles

| Tecla | Ação |
|---|---|
| WASD | Mover |
| J / Click esq. | Ataque leve |
| K / Click dir. (segure) | Ataque pesado / carregar |
| Espaço | Esquiva (i-frames) |
| Shift | Bloquear / Parry |
| Tab | Lock-on (mirar) |
| E | Interagir |
| F / G | Habilidades (Paladino/Mago) |
| I | Inventário |
| C | Crafting |
| 1-6 | Usar item do hotbar |
| Esc | Pausa / fechar painel |

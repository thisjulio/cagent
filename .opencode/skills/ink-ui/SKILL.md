---
name: ink-ui
description: Use before ANY Ink (terminal UI) work in this repo. Fixes the "React web" mental model, enforces wireframe-ASCII-first, and defines the mandatory snapshot verification via core/scripts/snap.tsx.
---

# Ink terminal UI — workflow obrigatório

## 0. Modelo mental (leia primeiro)

O modelo mental errado que você traz é "React web". Desfazê-lo é o ponto central desta skill.

- **Unidade é célula, não pixel.** `width={40}` são 40 colunas. `width="50%"` funciona. Bordas consomem 1 célula de cada lado; padding conta em células.
- **Layout é Yoga (subset de flexbox).** Existe: `flexDirection`, `flexGrow`, `flexShrink`, `flexBasis`, `gap`, `justifyContent`, `alignItems`, `padding*`, `margin*`, `borderStyle`. Não existe: grid, float, z-index, transições, `overflow: scroll`. Scroll você implementa fatiando o array e usando `useInput`.
- **`<Box>` nunca contém texto cru; `<Text>` nunca contém `<Box>`.** É o erro mais comum; o Ink lança em runtime.
- **Largura de caractere mente.** Emoji e CJK ocupam 2 células e destroem alinhamento de colunas. Meça sempre com `string-width`, nunca `.length`.
- **`<Static>` para logs append-only.** Sem isso, o app reescreve o scrollback inteiro a cada frame. O Ink já limita a ~30fps justamente para não despejar ASCII demais no terminal.
- **Responsividade.** Use `process.stdout.columns` + listener de resize; defina breakpoints (ex.: <70 colunas vira coluna única).
- **Cor é frágil.** Respeite `NO_COLOR`, nunca codifique informação só por cor, prefira `dimColor`/`bold` a paletas exóticas. Terminal claro vs escuro: evite branco puro e preto puro.

## 1. Wireframe ASCII antes do código (obrigatório)

Antes de implementar qualquer tela:

1. Desenhe o wireframe em ASCII **com largura fixa de 80 colunas** no plano. Pense em células, não em "mais ou menos aqui".
2. **Espere aprovação** do usuário antes de escrever código.
3. Depois de implementar, o snapshot (etapa 2) é comparado com o wireframe aprovado — é o critério objetivo de pronto/não pronto.

## 2. Snapshot obrigatório após qualquer mudança de UI

```
bun core/scripts/snap.tsx
```

O script renderiza o `App` em 3 larguras (60, 80, 120 cols) com régua de bordas para você enxergar overflow. Regras práticas:

- **O Ink emite códigos ANSI de `<Text>` estilizado mesmo fora de TTY** — assertions contra string pura falham. Por isso o script usa `strip-ansi`.
- **`measureElement` só funciona dentro de `useEffect`** (retorna 0,0 durante o render).
- Para capturar **estados de foco e navegação** (não só o estado inicial), use `stdin` do ink-testing-library:
  ```tsx
  const { lastFrame, frames, rerender, stdin } = render(<App c={controller} />);
  stdin.write("\t");      // tab → troca de foco
  stdin.write("\r");      // enter
  stdin.write("\x1B[B");  // seta para baixo
  // inspecione lastFrame() e frames
  ```
  `frames` contém todos os quadros renderizados — útil para ver transições.

## 3. Checklist antes de declarar UI pronta

1. Wireframe aprovado em 80 colunas existe?
2. `bun core/scripts/snap.tsx` roda sem erro e o layout bate com o wireframe nas 3 larguras?
3. Nada de texto cru em `<Box>` / `<Box>` dentro de `<Text>`?
4. Larguras medidas com `string-width` (não `.length`)?
5. Logs append-only usam `<Static>`?
6. Layout responde a <70 colunas (breakpoint) e respeita `NO_COLOR`?

Se qualquer item falhar, a UI não está pronta.

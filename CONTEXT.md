# cagent

Code agent com arquitetura de plugins: o núcleo (loop de agente + terminal UI) é a caixa vazia; tudo o que não é núcleo — provedores, ferramentas, integrações — é plugin.

## Núcleo

**Núcleo**:
Parte não-plugin do cagent: loop de agente (mensagem → LLM → tool call → resultado), gerenciamento de contexto, persistência de sessões e a terminal UI (OpenTUI).
_Avoid_: harness, engine, "caixa" (coloquial)

**Plugin**:
Unidade carregável que implementa exatamente uma categoria funcional: provedor, ferramenta ou integração.
_Avoid_: módulo, componente, extensão

**Provedor**:
Plugin que implementa um backend de LLM: cliente de API, autenticação e catálogo de modelos.
_Avoid_: backend, modelo, "LLM"

**Seleção de modelo**:
Usuário escolhe um modelo entre os provedores ativos; provedores habilitados ficam ativos e são usados apenas quando o usuário seleciona um modelo deles.
_Avoid_: seleção de provedor, troca de modelo

**Rota de modelo**:
String canônica que identifica um modelo: `$provider/$model`; o split pelo primeiro `/` retorna `[$provider, $model]`. Provedor e modelo nunca são referidos separadamente.
_Avoid_: nome de modelo (sem provedor), par (provider, model)

## Ferramentas

**Ferramenta**:
Operação invocada pelo agente que atua no sistema (executar bash, buscar código, editar arquivos).
_Avoid_: comando, função

**Ferramenta de codificação**:
Conjunto de ferramentas de manipulação de código (busca, edição, escrita), genéricas por padrão. Cada provedor pode sobrescrever as que o formato de seus modelos exige. Gerar código em si é capacidade do LLM, não ferramenta; rodar testes é workflow do usuário (via bash), não ferramenta.
_Avoid_: geração de código (capacidade do LLM), rodar testes (workflow do usuário), IDE

## Edição

**Superfície de edição**:
Ferramenta de edição no formato nativo do provedor: apply_patch (openai), SEARCH/REPLACE (llama.cpp). Uma superfície por provedor, via override do plugin do provedor sobre a ferramenta genérica. O formato exact-match old_string/new_string é ponto de extensão, não superfície ativa.
_Avoid_: perfil, formato de edição

**Override de tool**:
Mecanismo pelo qual um plugin de provedor substitui uma ferramenta genérica do plugin de tools por uma versão no formato nativo de sua família de modelos; a versão ativa resolve-se pela rota ativa.
_Avoid_: re-registro dinâmico, troca de tool

**IR de edição**:
Representação normalizada a que toda superfície normaliza antes do matching: caminho absoluto, busca, substituição e dica opcional de linha.
_Avoid_: patch, diff, bloco SEARCH/REPLACE

**Escada de matching**:
Ordem fixa de estratégias de casamento, do exato ao fuzzy, parada no primeiro sucesso; níveis fuzzy exigem limiar de confiança. Ambiguidade nunca é resolvida por heurística.
_Avoid_: fallback, fuzzy match

**Anti-loop**:
Contador de falhas idênticas dentro da tool que escala a mensagem e corta a 3ª repetição; existe porque o loop do núcleo é ilimitado e o erro volta ao modelo no mesmo turno.
_Avoid_: retry, timeout de tool

**Git sombra**:
Repo git paralelo que checkpointa os arquivos escritos antes de cada batch de escrita, para undo.
_Avoid_: backup, snapshot

**Convenção de erro**:
Prefixo de texto estável (ERRO <CODE> — <caminho>) que renderiza falhas para o modelo e para métricas, em vez de schema estruturado, porque o resultado de tool só carrega string.
_Avoid_: catálogo JSON, erro tipado

## Permissões

**Allowlist**:
Conjunto de comandos de ferramenta pré-aprovados; o que não está na lista exige aprovação no terminal antes de executar.
_Avoid_: whitelist, perfil de permissão

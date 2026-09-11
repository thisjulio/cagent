# cagent

Code agent com arquitetura de plugins: o núcleo (loop de agente + terminal UI) é a caixa vazia; tudo o que não é núcleo — provedores, ferramentas, integrações — é plugin.

## Núcleo

**Núcleo**:
Parte não-plugin do cagent: loop de agente (mensagem → LLM → tool call → resultado), gerenciamento de contexto, persistência de sessões e a terminal UI (ink).
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
Conjunto de ferramentas de manipulação de código (busca, edição, templates de código, templates de prompt). Gerar código em si é capacidade do LLM, não ferramenta; rodar testes é workflow do usuário (via bash), não ferramenta.
_Avoid_: geração de código (capacidade do LLM), rodar testes (workflow do usuário), IDE

## Permissões

**Allowlist**:
Conjunto de comandos de ferramenta pré-aprovados; o que não está na lista exige aprovação no terminal antes de executar.
_Avoid_: whitelist, perfil de permissão

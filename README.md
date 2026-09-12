# cagent

Agente de código para terminal, escrito em Bun/TypeScript. O núcleo coordena
conversas, sessões, ferramentas e a UI; provedores e ferramentas são plugins.

## Instalação

Linux e macOS:

```bash
curl -fsSL https://raw.githubusercontent.com/thisjulio/cagent/main/install.sh | bash
```

O instalador detecta a arquitetura, baixa o binário da última Release, verifica
o SHA-256 e instala `cagent` em `~/.local/bin`. Abra um novo terminal depois da
instalação, ou execute:

```bash
export PATH="$HOME/.local/bin:$PATH"
cagent
```

Para instalar uma versão específica:

```bash
  curl -fsSL https://raw.githubusercontent.com/thisjulio/cagent/main/install.sh | bash -s -- --version 0.1.4
```

Depois de instalado, atualize para a última Release com:

```bash
cagent upgrade
```

Se a versão atual já for a mais recente, o cagent informa que não há upgrade.
O usuário que instalou em um diretório protegido, como `/usr/local/bin`, deve
executar o comando com a mesma permissão usada na instalação.

## Configuração

O cagent lê a configuração global em `~/.cagent/config.yml` e a configuração
local em `cagent.yml`. A configuração local tem prioridade.

Exemplo mínimo usando a API da OpenAI:

```bash
export OPENAI_API_KEY="sua-chave"
mkdir -p ~/.cagent
cat > ~/.cagent/config.yml <<'YAML'
model: openai/gpt-4o-mini
YAML
```

A rota do modelo sempre usa o formato `provedor/modelo`. O plugin OpenAI também
suporta o login OAuth usado pelo Codex quando nenhuma chave de API é definida.

## Desenvolvimento

Requer Bun:

```bash
git clone https://github.com/thisjulio/cagent.git
cd cagent
bun install
bun start
```

Comandos úteis:

```bash
bun test
bun run build:release
```

## Plugins incluídos

- `openai`: provedor OpenAI e Codex.
- `llama.cpp`: provedor compatível com `llama-server`.
- `bash`: execução de comandos no workspace.
- `code-tools`: leitura, busca, edição e busca estrutural por AST.

`search_ast` usa `@ast-grep/napi` em processo, sem executar `bun x` ou um CLI
externo. As linguagens embutidas são JavaScript, TypeScript, TSX, HTML e CSS.

## Arquitetura

```text
UI terminal -> Controller -> núcleo (loop, sessões, registry) -> SDK
                                      ^
                                      |
                                  plugins
```

Consulte [`CONTEXT.md`](CONTEXT.md) e [`docs/adr/`](docs/adr/) para o glossário
e as decisões arquiteturais.

## Release

Uma tag `v*` dispara o workflow de release. O CI gera executáveis para Linux e
macOS em `x64` e `arm64`, publica os quatro binários e o arquivo `SHA256SUMS`.

```bash
git tag v0.1.0
git push origin v0.1.0
```

## Status

O projeto está em desenvolvimento ativo. APIs de plugins e formatos de
configuração podem mudar antes da versão 1.0.

## Licença

MIT. Consulte [`LICENSE`](LICENSE).

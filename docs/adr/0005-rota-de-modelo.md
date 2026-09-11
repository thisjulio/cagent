# Rota de modelo: `$provider/$model`

A seleção de modelo estava ambígua: a config declarava só o modelo e o provedor caía no primeiro registrado no registry — combinava provedor e modelo de forma esquisita (ex.: `llama.cpp` + `gpt-5.6-luna`). Decidido: um modelo é sempre dado pela string `$provider/$model`; o split pelo primeiro `/` retorna `[$provider, $model]`.

## Considered Options

- Campos separados `provider` e `model` na config: duplica informação que a string já carrega e permite os dois divergir.
- Provedor padrão = primeiro registrado: status quo; a ordem dos plugins na config virou comportamento implícito.

## Consequences

- `model` na config vira a rota completa (ex.: `openai/gpt-5.6-luna`); o bootstrap resolve o provedor a partir da string, sem depender da ordem de registro.
- O bootstrap valida o par inteiro: provedor existe no registry **e** o modelo existe no catálogo do provedor (`list_models`); par inválido → erro claro no boot.
- Sem `model` na config: fallback = primeiro provedor registrado + o primeiro modelo de seu catálogo, sempre expresso como `$provider/$model`.
- Provedor e modelo em estado/sessões/UI usam a rota canônica (status bar, model picker, persistência).
- Nomes de modelo que contêm `/` (ex.: `org/repo` do HuggingFace): o split é pelo **primeiro** `/`; o segmento antes é o provedor, o resto é o nome do modelo.

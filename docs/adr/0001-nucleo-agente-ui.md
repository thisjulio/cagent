# Núcleo = agente + UI

O núcleo do cagent implementa o loop de agente (mensagem → LLM → tool call → resultado), gerenciamento de contexto, persistência de sessões e a terminal UI (ink; ver ADR-0004). Plugins implementam apenas três categorias: provedor, ferramenta e integração. A alternativa de núcleo mínimo (só UI + host de plugins, com o próprio loop como plugin) foi rejeitada: um núcleo que possui o loop dá a todos os plugins uma superfície de extensão única e previsível e mantém o runtime determinístico.

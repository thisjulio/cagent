# Crash de plugin derruba o core (v1)

Sem isolamento de crash na v1: a execução de cada tool call é envuelta em try/catch no núcleo (barato em JS), mas um crash não tratado dentro do plugin (unhandled rejection, erro fatal) derruba o processo. Rejeitados isolamento por processo (custo de IPC) e por worker (complexidade). Consequência: plugins são validados em testes antes de uso em produção.

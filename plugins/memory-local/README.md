# Local Memory Plugin

The local memory plugin provides offline, project-scoped and user-scoped context for cagent.

## Enable

```yaml
plugins:
  - name: memory-local
    path: ./plugins/memory-local
    config:
      enabled: true
      capture: true
      retrieval: false
      top_k: 5
      min_score: 0.01
```

Capture and retrieval are independent. Retrieval is disabled by default and can be changed for the current session with `memory_retrieval`; automatic capture can be changed with `memory_capture`.

## Data and privacy

The default JSON compatibility store is under `~/.cagent/memory-local.json`. Plugin-scoped storage uses `~/.cagent/plugins/memory-local` or `CAGENT_DATA_DIR`. Project identity uses the Git root and origin remote, with a deterministic non-Git fallback.

Memory operations are local-only. Runtime model loading disables remote model downloads. Automatic candidates remain pending and likely credentials or personal identifiers are masked before persistence.

## Maintenance

Available tools include `memory_add`, `memory_list`, `memory_search`, `memory_show`, `memory_edit`, `memory_approve`, `memory_ignore`, `memory_archive`, `memory_forget`, `memory_backup`, `memory_restore`, `memory_status`, and `memory_diagnostics`.

Forgetting and restoring require explicit confirmation. Backup files should be protected with the same filesystem permissions as the data directory.

## Embeddings

The baseline is `intfloat/multilingual-e5-small` through Transformers.js. The downloaded int8 artifact is stored at `~/.cache/cagent/models/Xenova/multilingual-e5-small`; configure that directory as `model_path`. Runtime operation never downloads models. Embeddings are loaded lazily, record model metadata, and are refreshed by explicit reindexing. Artifact SHA-256: `4d24e2bc01a447951524466ef533e52944bf48509e6552810bcee1a2711cb02c`.

## Support and limitations

The plugin targets Bun on platforms supported by `better-sqlite3` and Transformers.js CPU execution. If the embedding artifact is unavailable, lexical FTS5 retrieval remains available. Automatic expiration and remote fallback are intentionally unsupported.

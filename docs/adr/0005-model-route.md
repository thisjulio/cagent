# Model route: `$provider/$model`

Model selection was ambiguous: the config declared only the model and the provider fell back to the first provider registered in the registry, combining provider and model in surprising ways (for example, `llama.cpp` + `gpt-5.6-luna`). Decision: a model is always represented by the `$provider/$model` string; splitting on the first `/` returns `[$provider, $model]`.

## Considered Options

- Separate `provider` and `model` config fields: duplicates information already carried by the string and allows the two to diverge.
- Default provider = first registered: status quo; plugin order in the config becomes implicit behavior.

## Consequences

- `model` in the config becomes the complete route (for example, `openai/gpt-5.6-luna`); bootstrap resolves the provider from the string without depending on registration order.
- Bootstrap validates the complete pair: the provider exists in the registry **and** the model exists in the provider catalog (`list_models`); an invalid pair produces a clear boot error.
- Without `model` in the config: fallback = first registered provider + the first model in its catalog, always expressed as `$provider/$model`.
- Provider and model in state/sessions/UI use the canonical route (status bar, model picker, persistence).
- Model names containing `/` (for example, a Hugging Face `org/repo`): split on the **first** `/`; the segment before it is the provider and the rest is the model name.

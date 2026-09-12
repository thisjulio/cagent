# cagent

Code agent with a plugin architecture: the core (agent loop + terminal UI) is the empty box; everything outside the core — providers, tools, and integrations — is a plugin.

## Core

**Core**:
The non-plugin part of cagent: agent loop (message → LLM → tool call → result), context management, session persistence, and the terminal UI (OpenTUI).
_Avoid_: harness, engine, "box" (colloquial)

**Plugin**:
Loadable unit that implements exactly one functional category: provider, tool, or integration.
_Avoid_: module, component, extension

**Provider**:
Plugin that implements an LLM backend: API client, authentication, and model catalog.
_Avoid_: backend, model, "LLM"

**Model selection**:
The user chooses a model from the active providers; enabled providers remain active and are used only when the user selects one of their models.
_Avoid_: provider selection, model switching

**Model route**:
Canonical string identifying a model: `$provider/$model`; splitting on the first `/` returns `[$provider, $model]`. Provider and model are never referred to separately.
_Avoid_: model name (without provider), (provider, model) pair

## Tools

**Tool**:
Operation invoked by the agent that acts on the system (run bash, search code, edit files).
_Avoid_: command, function

**Coding tool**:
Set of code manipulation tools (search, edit, write), generic by default. Each provider can override the ones required by its model format. Generating code is an LLM capability, not a tool; running tests is the user's workflow (through bash), not a tool.
_Avoid_: code generation (LLM capability), running tests (user workflow), IDE

## Editing

**Editing surface**:
Editing tool in the provider's native format: apply_patch (openai), SEARCH/REPLACE (llama.cpp). One surface per provider, through the provider plugin overriding the generic tool. The exact-match old_string/new_string format is an extension point, not an active surface.
_Avoid_: profile, editing format

**Tool override**:
Mechanism by which a provider plugin replaces a generic tool from the tools plugin with a version in its model family's native format; the active version is resolved from the active route.
_Avoid_: dynamic re-registration, tool switching

**Editing IR**:
Normalized representation to which every surface normalizes before matching: absolute path, search, replacement, and an optional line hint.
_Avoid_: patch, diff, SEARCH/REPLACE block

**Matching ladder**:
Fixed order of matching strategies, from exact to fuzzy, stopping at the first success; fuzzy levels require a confidence threshold. Ambiguity is never resolved heuristically.
_Avoid_: fallback, fuzzy match

**Anti-loop**:
Counter of identical failures inside the tool that escalates the message and stops on the third repetition; it exists because the core loop is unlimited and the error returns to the model in the same turn.
_Avoid_: retry, tool timeout

**Shadow Git**:
Parallel Git repository that checkpoints written files before each write batch, for undo.
_Avoid_: backup, snapshot

**Error convention**:
Stable text prefix (`ERROR <CODE> — <path>`) that renders failures for the model and metrics instead of a structured schema, because tool results only carry strings.
_Avoid_: JSON catalog, typed error

## Permissions

**Allowlist**:
Set of pre-approved tool commands; anything not on the list requires approval in the terminal before execution.
_Avoid_: whitelist, permission profile

# @agents/plugins — Plugin & Extensibility Agent

## Mission
Build the plugin architecture, provider abstraction layer, SDK, and extension points.

## Plugin Manifest Schema
```json
{
  "id": "plugin-id", "name": "Plugin Name", "version": "1.0.0",
  "author": "Author", "permissions": ["tool:read", "memory:write"],
  "extensionPoints": ["tool-bus", "workflow-trigger", "knowledge-source"],
  "tools": [], "hooks": [], "config": {}
}
```

## Key Files to Build
- `packages/aios-plugins/src/plugin.registry.ts`
- `packages/aios-plugins/src/plugin.loader.ts`
- `packages/aios-plugins/src/plugin.manifest.schema.ts`
- `packages/aios-sdk/src/zenith-sdk.ts`
- `packages/aios-sdk/src/provider.adapter.ts`

## Provider Abstraction
All AI model calls MUST go through ProviderAdapter:
- AnthropicAdapter | OpenAIAdapter | AzureAdapter | LocalAdapter

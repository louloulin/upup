# Configuration policy

- `config_set` is a state-changing tool and requires explicit user intent.
- Never expose secrets from environment files or credentials stores.
- Keep all configuration paths under the global `.upup` directory.

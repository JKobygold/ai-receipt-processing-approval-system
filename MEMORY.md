# Memory

Short lessons that should change future behavior in this repo.

- The IDE's JSHint flags modern JS in `static/app.js` (async, `?.`, `??`, spread) as errors — false positives from a stale ES5 lint config. Verify with `node --check` instead; don't "fix" the syntax.
- UI design language is deliberately shared with the Bala Chabad CRM (`~/Projects/Crm- Chabad/frontend/styles.css`) — navy/gold/cream palette, Lora + Source Sans 3. Keep new UI in that skin.

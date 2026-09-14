export default function examplePiPackage(pi) {
  pi.registerTool({
    name: 'example_greet',
    label: 'Example greet',
    description: 'Return a deterministic greeting from a Pi Package.',
    parameters: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    async execute(toolCallId, input) {
      const name = typeof input.name === 'string' && input.name.trim() ? input.name.trim() : 'investor';
      return {
        content: [{ type: 'text', text: `Hello, ${name}!` }],
        details: { auditId: toolCallId, source: 'example-pi-package://greet', dataFreshness: 'offline' },
      };
    },
  });
}

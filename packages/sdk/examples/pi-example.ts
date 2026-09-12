import { createClient } from '../src/index.js';

export async function runPiExample(title: string, prompt: string): Promise<void> {
  console.log(`=== ${title} ===`);
  const client = await createClient({ useUpupSession: true });
  try {
    const result = await client.query(prompt);
    console.log(result.result);
  } finally {
    await client.close();
  }
}

/**
 * Uploads shared/data/kb/ to the knowledge base bucket and starts an ingestion job (task 23).
 * Run `npm run kb` first if the documents changed, and deploy with MEDORA_ENABLE_KB=true so
 * frontend/amplify_outputs.json has the knowledgeBase section.
 *
 *   npm run upload-kb       (uses your current AWS credentials)
 *
 * Only uploads: it never deletes anything. Cost: Titan Text Embeddings V2 on 25 small documents,
 * a fraction of a US cent per run. Synthetic data only.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { BedrockAgentClient, GetIngestionJobCommand, StartIngestionJobCommand } from '@aws-sdk/client-bedrock-agent';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const REGION = 'us-east-1';
const root = resolve('shared/data/kb');

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir).sort()) {
    const path = resolve(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

async function main(): Promise<void> {
  const outputs = JSON.parse(readFileSync(resolve('frontend/amplify_outputs.json'), 'utf8')) as {
    custom?: { knowledgeBase?: { knowledgeBaseId: string; dataSourceId: string; docsBucket: string; region: string } };
  };
  const kb = outputs.custom?.knowledgeBase;
  if (!kb) throw new Error('No knowledgeBase in frontend/amplify_outputs.json. Deploy the sandbox with MEDORA_ENABLE_KB=true.');
  if (kb.region !== REGION) throw new Error(`Refusing to use ${kb.region}: this project uses ${REGION} only.`);

  const s3 = new S3Client({ region: REGION });
  let count = 0;
  for (const file of files(root)) {
    const key = relative(root, file).split('\\').join('/');
    await s3.send(
      new PutObjectCommand({
        Bucket: kb.docsBucket,
        Key: key,
        Body: readFileSync(file),
        ContentType: key.endsWith('.json') ? 'application/json' : 'text/markdown; charset=utf-8',
      }),
    );
    count += 1;
  }
  console.log(`Uploaded ${count} files to ${kb.docsBucket}`);

  const agent = new BedrockAgentClient({ region: REGION });
  const started = await agent.send(new StartIngestionJobCommand({ knowledgeBaseId: kb.knowledgeBaseId, dataSourceId: kb.dataSourceId }));
  const jobId = started.ingestionJob?.ingestionJobId;
  if (!jobId) throw new Error('The ingestion job did not start.');
  for (let attempt = 0; attempt < 60; attempt += 1) {
    await new Promise((done) => setTimeout(done, 5_000));
    const { ingestionJob } = await agent.send(
      new GetIngestionJobCommand({ knowledgeBaseId: kb.knowledgeBaseId, dataSourceId: kb.dataSourceId, ingestionJobId: jobId }),
    );
    const status = ingestionJob?.status;
    console.log(`Ingestion: ${status}`);
    if (status === 'COMPLETE') {
      const stats = ingestionJob?.statistics;
      console.log(`Indexed ${stats?.numberOfNewDocumentsIndexed ?? 0} new, ${stats?.numberOfModifiedDocumentsIndexed ?? 0} changed, ${stats?.numberOfDocumentsFailed ?? 0} failed.`);
      return;
    }
    if (status === 'FAILED') throw new Error(`Ingestion failed: ${ingestionJob?.failureReasons?.join('; ') ?? 'no reason given'}`);
  }
  throw new Error('Ingestion did not finish within five minutes. Check the Bedrock console.');
}

main().catch((error: unknown) => {
  console.error(`Upload failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

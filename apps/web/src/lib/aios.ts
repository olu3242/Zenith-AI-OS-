import { createAIOS, type AIOS } from '@zenith/aios-sdk';

let _aios: AIOS | null = null;

export async function getAIOS(): Promise<AIOS> {
  if (!_aios) {
    _aios = await createAIOS({
      organizationId: process.env['ZENITH_ORG_ID'] ?? 'default',
      anthropicApiKey: process.env['ANTHROPIC_API_KEY'],
      openAiApiKey: process.env['OPENAI_API_KEY'],
    });
  }
  return _aios;
}

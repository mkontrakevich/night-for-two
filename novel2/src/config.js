export const config = Object.freeze({
  port: Number(process.env.NOVEL2_PORT || 5690),
  databaseUrl: String(process.env.DATABASE_URL || ''),
  botToken: String(process.env.TELEGRAM_BOT_TOKEN || ''),
  ownerId: String(process.env.PRIMARY_OWNER_ID || ''),
  partnerId: String(process.env.PARTNER_TELEGRAM_ID || ''),
  openRouterKey: String(process.env.OPENROUTER_API_KEY || ''),
  textModel: String(process.env.NOVEL2_TEXT_MODEL || 'openai/gpt-5.6'),
  visionModel: String(process.env.NOVEL2_VISION_MODEL || 'openai/gpt-5.6'),
  imageModel: String(process.env.NOVEL2_IMAGE_MODEL || 'bytedance-seed/seedream-5-0-flash'),
  localTest: /^(1|true|yes)$/i.test(String(process.env.NOVEL2_LOCAL_TEST_MODE || ''))
});

export function assertProductionConfig() {
  const missing = [];
  for (const [key, value] of Object.entries({
    DATABASE_URL: config.databaseUrl,
    TELEGRAM_BOT_TOKEN: config.botToken,
    PRIMARY_OWNER_ID: config.ownerId,
    PARTNER_TELEGRAM_ID: config.partnerId,
    OPENROUTER_API_KEY: config.openRouterKey
  })) if (!value) missing.push(key);
  if (missing.length && !config.localTest) throw new Error('NOVEL2_CONFIG_MISSING:' + missing.join(','));
}

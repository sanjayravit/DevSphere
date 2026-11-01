const providers = ['openai', 'firebase', 'github', 'socket', 'vercel'];
export function integrationPreflight(env = process.env, provider = 'all') {
  const selected = provider === 'all' ? providers : providers.includes(provider) ? [provider] : [];
  const blockers = []; if (!selected.length) blockers.push('Unknown provider.');
  const need = name => { if (!env[name]) blockers.push(`${name} is required.`); };
  if (env.ENABLE_PRODUCTION_DEPLOYMENTS === 'true') blockers.push('Production deployment must be disabled.');
  if (env.DEVSPHERE_INTEGRATION_ENABLED !== 'true') blockers.push('DEVSPHERE_INTEGRATION_ENABLED is not true.');
  if (env.STAGING_CONFIRMATION !== 'disposable-resources-only') blockers.push('STAGING_CONFIRMATION must explicitly acknowledge disposable-resources-only.');
  if (selected.some(p => ['github', 'vercel'].includes(p))) {
    need('STAGING_GITHUB_TOKEN'); need('STAGING_GITHUB_REPOSITORY');
    if (!/^[A-Za-z0-9_.-]+\/devsphere-verification-[A-Za-z0-9_.-]+$/.test(env.STAGING_GITHUB_REPOSITORY || '')) blockers.push('Use a dedicated owner/devsphere-verification-* repository.');
    if (env.STAGING_GITHUB_REPOSITORY && env.STAGING_GITHUB_REPOSITORY === env.GITHUB_REPOSITORY) blockers.push('Staging and application repository must differ.');
  }
  if (selected.includes('openai')) { need('STAGING_OPENAI_API_KEY'); need('STAGING_OPENAI_MODEL'); }
  if (selected.includes('firebase')) {
    need('STAGING_FIREBASE_PROJECT_ID');
    if (!/^(demo-|.*(?:staging|sandbox|test)-)/.test(env.STAGING_FIREBASE_PROJECT_ID || '')) blockers.push('Firebase project must have a staging/test/sandbox or demo name.');
    if (env.STAGING_FIREBASE_PROJECT_ID && env.STAGING_FIREBASE_PROJECT_ID === env.FIREBASE_PROJECT_ID) blockers.push('Staging and application Firebase projects must differ.');
    if (!env.FIRESTORE_EMULATOR_HOST) need('STAGING_GOOGLE_APPLICATION_CREDENTIALS');
    if (env.FIRESTORE_EMULATOR_HOST && !/^(localhost|127\.0\.0\.1):\d+$/.test(env.FIRESTORE_EMULATOR_HOST)) blockers.push('Only a local Firestore emulator is supported.');
  }
  if (selected.includes('socket')) {
    for (const name of ['STAGING_SOCKET_URL', 'STAGING_API_URL', 'STAGING_JWT_SECRET', 'STAGING_SOCKET_OWNER', 'STAGING_SOCKET_OTHER']) need(name);
    for (const name of ['STAGING_SOCKET_URL', 'STAGING_API_URL']) {
      try { const url = new URL(env[name]); if (url.protocol !== 'https:' || !/staging|sandbox|test/.test(url.hostname) || url.username || url.password || url.search || url.hash) throw new Error(); }
      catch { blockers.push(`${name} must be an explicit staging HTTPS URL.`); }
    }
    if ((env.STAGING_JWT_SECRET || '').length < 32) blockers.push('Strong staging JWT secret required.');
    if (env.STAGING_SOCKET_OWNER === env.STAGING_SOCKET_OTHER) blockers.push('Two distinct staging identities required.');
  }
  if (selected.includes('vercel')) {
    for (const name of ['STAGING_VERCEL_TOKEN', 'STAGING_VERCEL_PROJECT_ID', 'STAGING_VERCEL_PROJECT_NAME']) need(name);
    if (!/^(devsphere-verification|devsphere-staging)-/.test(env.STAGING_VERCEL_PROJECT_NAME || '')) blockers.push('Use a dedicated devsphere-verification-* Vercel project.');
    if (env.STAGING_VERCEL_PROJECT_ID && env.STAGING_VERCEL_PROJECT_ID === env.VERCEL_PROJECT_ID) blockers.push('Staging and application Vercel project must differ.');
    if (provider !== 'all' && !/^devsphere-verification\/[A-Za-z0-9_-]+$/.test(env.STAGING_PREVIEW_REF || '')) blockers.push('STAGING_PREVIEW_REF must name an isolated verification branch.');
  }
  return { mode: 'configuration-only; no provider calls', selected, enabled: blockers.length === 0, blockers };
}
export function requireLiveConfiguration(env, provider) {
  const result = integrationPreflight(env, provider);
  if (!result.enabled) throw new Error(result.blockers.join(' '));
  return result;
}

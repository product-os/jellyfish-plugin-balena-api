import { defaultEnvironment } from '@balena/jellyfish-environment';
import type { ContractDefinition } from '@balena/jellyfish-types/build/core';

export const oauthClientBalenaAPI: ContractDefinition = {
	slug: 'oauth-client-balena-api',
	type: 'oauth-client@1.0.0',
	name: 'Balena oauth client',
	data: {
		clientId: defaultEnvironment.integration['balena-api'].appId,
		clientSecret: defaultEnvironment.integration['balena-api'].appSecret,
	},
};

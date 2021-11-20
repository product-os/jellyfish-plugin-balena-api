import type { ContractDefinition } from '@balena/jellyfish-types/build/core';

export const oauthProviderBalenaAPI: ContractDefinition = {
	slug: 'oauth-provider-balena-api',
	type: 'oauth-provider@1.0.0',
	name: 'Balena oauth provider',
	data: {
		authorizeUrl: 'https://dashboard.balena-cloud.com/login/oauth/{{clientId}}',
		tokenUrl: 'https://api.balena-cloud.com/oauth/token',
		whoamiUrl: 'https://api.balena-cloud.com/user/v1/whoami',
		whoamiFieldMap: {
			username: ['username'],
		},
	},
};

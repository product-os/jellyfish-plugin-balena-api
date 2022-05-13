import type { ContractDefinition } from '@balena/jellyfish-types/build/core';
import { defaultEnvironment as environment } from '@balena/jellyfish-environment';
import qs from 'qs';

export const oauthProviderBalenaAPI: ContractDefinition = {
	slug: 'oauth-provider-balena-api',
	type: 'oauth-provider@1.0.0',
	name: 'Balena oauth provider',
	data: {
		authorizeUrl: `https://dashboard.balena-cloud.com/login/oauth/${
			environment.integration['balena-api'].appId
		}?${qs.stringify({
			response_type: 'code',
		})}`,
		tokenUrl: 'https://api.balena-cloud.com/oauth/token',
		clientId: environment.integration['balena-api'].appId,
		clientSecret: environment.integration['balena-api'].appSecret,
		integration: 'balena-api',
	},
};

import { oauthClientBalenaAPI } from './balena/oauth-client-balena-api';
import { oauthProviderBalenaAPI } from './balena/oauth-provider-balena-api';
import { balenaAccount } from './balena/balena-account';

export const cards = [
	oauthClientBalenaAPI,
	oauthProviderBalenaAPI,
	balenaAccount,
];

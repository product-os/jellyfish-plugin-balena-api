import { IntegrationDefinition, Map } from '@balena/jellyfish-worker';
import { balenaApiIntegrationDefinition } from './balena-api';

export const integrations: Map<IntegrationDefinition> = {
	['balena-api']: balenaApiIntegrationDefinition,
};

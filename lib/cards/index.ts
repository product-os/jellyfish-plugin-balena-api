/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import { oauthClientBalenaAPI } from './balena/oauth-client-balena-api';
import { oauthProviderBalenaAPI } from './balena/oauth-provider-balena-api';

export const cards = [oauthClientBalenaAPI, oauthProviderBalenaAPI];

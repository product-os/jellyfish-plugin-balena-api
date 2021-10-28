/*
 * Copyright (C) Balena.io - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited.
 * Proprietary and confidential.
 */

import type { ContractDefinition } from '@balena/jellyfish-types/build/core';

export const balenaAccount: ContractDefinition = {
	type: 'type@1.0.0',
	slug: 'balena-account',
	data: {
		schema: {
			slug: {
				type: 'string',
				pattern: '^balena-account-[a-z0-9-]+$',
				fullTextSearch: true,
			},
			data: {
				type: 'object',
				properties: {
					username: {
						type: 'string',
					},
					email: {
						type: 'string',
					},
					has_legacy_link_to__organization: {
						type: 'array',
						items: {
							type: 'object',
							properties: {
								company_name: {
									type: 'string',
								},
							},
						},
					},
					company: {
						type: 'string',
					},
					account_type: {
						type: 'string',
					},
					first_name: {
						type: 'string',
					},
					last_name: {
						type: 'string',
					},
					ip: {
						type: 'string',
					},
				},
			},
		},
	},
};
